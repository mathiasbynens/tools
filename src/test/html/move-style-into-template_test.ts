/**
 * @license
 * Copyright (c) 2017 The Polymer Project Authors. All rights reserved.
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

import {assert} from 'chai';
import * as path from 'path';
import {Analyzer, FSUrlLoader} from 'polymer-analyzer';

import {MoveStyleIntoTemplate} from '../../html/move-style-into-template';
import {Linter} from '../../linter';
import {WarningPrettyPrinter} from '../util';

const fixtures_dir = path.resolve(path.join(__dirname, '../../../test'));

suite('MoveStyleIntoTemplate', () => {
  let analyzer: Analyzer;
  let warningPrinter: WarningPrettyPrinter;
  let linter: Linter;

  setup(() => {
    analyzer = new Analyzer({urlLoader: new FSUrlLoader(fixtures_dir)});
    warningPrinter = new WarningPrettyPrinter(analyzer);
    linter = new Linter([new MoveStyleIntoTemplate()], analyzer);
  });

  test('works in the trivial case', async() => {
    const warnings = await linter.lint([]);
    assert.deepEqual(warnings, []);
  });

  test('gives no warnings for a perfectly fine file', async() => {
    const warnings = await linter.lint(['perfectly-fine/polymer-element.html']);
    assert.deepEqual(warnings, []);
  });

  test('warns for a file with a style outside template', async() => {
    const warnings = await linter.lint(
        ['move-style-into-template/style-child-of-dom-module.html']);
    assert.deepEqual(await warningPrinter.prettyPrint(warnings), [`
  <style>
  ~~~~~~~
    * {color: red;}
~~~~~~~~~~~~~~~~~~~
  </style>
~~~~~~~~~~`]);
  });
});
