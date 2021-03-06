/**
 * @license
 * Copyright (c) 2016 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */

// Be careful with these imports. As many as possible should be dynamic imports
// in the run method in order to minimize startup time from loading unused code.

import * as logging from 'plylog';
import {applyBuildPreset, ProjectBuildOptions, ProjectConfig} from 'polymer-project-config';

import {dashToCamelCase} from '../util';

import {Command, CommandOptions} from './command';

const logger = logging.getLogger('cli.command.build');

// This flag is special because it doesn't necessarily trigger a one-off single
// build.
const autoBasePath = 'auto-base-path';

export class BuildCommand implements Command {
  name = 'build';
  aliases = [];

  description = 'Builds an application-style project';

  args = [
    {
      name: 'name',
      type: String,
      description: 'The build name. Defaults to "default".',
    },
    {
      name: 'preset',
      type: String,
      description: 'A preset configuration to base your build on. ' +
          'User-defined options will override preset options. Optional. ' +
          'Available presets: "es5-bundled", "es6-bundled", "es6-unbundled". '
    },
    {
      name: 'js-compile',
      type: Boolean,
      description: 'Compile ES2015 JavaScript features down to ES5 for ' +
          'older browsers.'
    },
    {
      name: 'js-transform-modules-to-amd',
      type: Boolean,
      description: 'Transform ES modules to AMD modules.',
    },
    {
      name: 'js-transform-import-meta',
      type: Boolean,
      description:
          'Rewrite import.meta expressions to objects with inline URLs.',
    },
    {
      name: 'js-minify',
      type: Boolean,
      description: 'Minify inlined and external JavaScript.'
    },
    {
      name: 'css-minify',
      type: Boolean,
      description: 'Minify inlined and external CSS.'
    },
    {
      name: 'html-minify',
      type: Boolean,
      description: 'Minify HTML by removing comments and whitespace.'
    },
    {
      name: 'bundle',
      type: Boolean,
      description: 'Combine build source and dependency files together into ' +
          'a minimum set of bundles. Useful for reducing the number of ' +
          'requests needed to serve your application.'
    },
    {
      name: 'add-service-worker',
      type: Boolean,
      description: 'Generate a service worker for your application to ' +
          'cache all files and assets on the client.'
    },
    {
      name: 'add-push-manifest',
      type: Boolean,
      description: 'Generate a push manifest for your application for http2' +
          'push-enabled servers to read.'
    },
    {
      name: 'sw-precache-config',
      type: String,
      description: 'Path to a file that exports configuration options for ' +
          'the generated service worker. These options match those supported ' +
          'by the sw-precache library. See ' +
          'https://github.com/GoogleChrome/sw-precache#options-parameter ' +
          'for a list of all supported options.'
    },
    {
      name: 'insert-prefetch-links',
      type: Boolean,
      description: 'Add dependency prefetching by inserting ' +
          '`<link rel="prefetch">` tags into entrypoint and ' +
          '`<link rel="import">` tags into fragments and shell for all ' +
          'dependencies.'
    },
    {
      name: 'base-path',
      type: String,
      description: 'Updates the <base> tag if found in the entrypoint document.'
    },
    {
      name: autoBasePath,
      type: Boolean,
      description: 'For all builds, set the entrypoint <base> tag to match ' +
          'the build name. Does not necessarily trigger a one-off build.',
    },
  ];

  /**
   * Converts command-line build arguments to the `ProjectBuildOptions` format
   * that our build understands, applying the preset if one was given.
   */
  private commandOptionsToBuildOptions(options: CommandOptions):
      ProjectBuildOptions {
    const buildOptions: ProjectBuildOptions = {};
    const validBuildOptions = new Set(this.args.map(({name}) => name));

    // This flag is special. It affects the top-level config, not an individual
    // build.
    validBuildOptions.delete(autoBasePath);

    for (const buildOption of Object.keys(options)) {
      if (validBuildOptions.has(buildOption)) {
        const [prefix, ...rest] = buildOption.split('-');
        if (['css', 'html', 'js'].indexOf(prefix) !== -1) {
          const option = dashToCamelCase(rest.join('-'));
          // tslint:disable-next-line: no-any Scary and unsafe!
          (<any>buildOptions)[prefix] = (<any>buildOptions)[prefix] || {};
          // tslint:disable-next-line: no-any Scary and unsafe!
          (<any>buildOptions)[prefix][dashToCamelCase(option)] =
              options[buildOption];
        } else {
          // tslint:disable-next-line: no-any Scary and unsafe!
          (<any>buildOptions)[dashToCamelCase(buildOption)] =
              options[buildOption];
        }
      }
    }
    if (options[autoBasePath]) {
      buildOptions.basePath = true;
    }
    return applyBuildPreset(buildOptions);
  }

  async run(options: CommandOptions, config: ProjectConfig) {
    // Defer dependency loading until this specific command is run
    const del = await import('del');
    const buildLib = await import('../build/build');
    const polymerBuild = await import('polymer-build');
    const path = await import('path');
    let build = buildLib.build;
    const mainBuildDirectoryName = buildLib.mainBuildDirectoryName;

    // Validate our configuration and exit if a problem is found.
    // Neccessary for a clean build.
    config.validate();

    // Support passing a custom build function via options.env
    if (options['env'] && options['env'].build) {
      logger.debug('build function passed in options, using that for build');
      build = options['env'].build;
    }

    logger.info(`Clearing ${mainBuildDirectoryName}${path.sep} directory...`);
    await del([mainBuildDirectoryName]);

    const mzfs = await import('mz/fs');
    await mzfs.mkdir(mainBuildDirectoryName);

    const polymerProject = new polymerBuild.PolymerProject(config);

    // If any the build command flags were passed as CLI arguments, generate
    // a single build based on those flags alone.
    const hasOneOffBuildArgumentPassed = this.args.some((arg) => {
      return typeof options[arg.name] !== 'undefined' &&
          arg.name !== autoBasePath;
    });
    if (hasOneOffBuildArgumentPassed) {
      await build(this.commandOptionsToBuildOptions(options), polymerProject);
      return;
    }

    // If no build flags were passed but 1+ polymer.json build configuration(s)
    // exist, generate a build for each configuration found.
    if (config.builds) {
      const promises = config.builds.map((buildOptions) => {
        if (options[autoBasePath]) {
          buildOptions.basePath = true;
        }
        return build(buildOptions, polymerProject);
      });
      promises.push(mzfs.writeFile(
          path.join(mainBuildDirectoryName, 'polymer.json'), config.toJSON()));
      await Promise.all(promises);
      return;
    }

    // If no builds were defined, just generate a default build.
    await build({}, polymerProject);
  }
}
