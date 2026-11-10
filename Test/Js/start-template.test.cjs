// Copyright © 2026 Blue Fairy Development. All rights reserved.
//
// The start-up script of view/frontend/templates/marker/start.phtml, run as a browser would run it.
// The script is taken out of the template itself, so what is tested is what ships.
//   node --test Test/Js/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const template = fs.readFileSync(path.join(__dirname, '../../view/frontend/templates/marker/start.phtml'), 'utf8');
const inline = template.match(/<script>\n([\s\S]*?)<\/script>/);

assert.ok(inline, 'the template has an inline script');
const SOURCE = inline[1];

function script(text, src = null) {
    return {
        tagName: 'SCRIPT', textContent: text, type: '', parentNode: null,
        getAttribute: (name) => (name === 'src' ? src : null),
        querySelectorAll: () => []
    };
}

/** An element holding inline scripts with the given texts. */
function block(texts = [], inputs = []) {
    return {
        tagName: 'DIV', top: 10, scrolled: 0,
        getAttribute: () => null,
        querySelectorAll: (selector) => (selector === 'script:not([src])' ? texts.map((text) => script(text)) : inputs),
        getBoundingClientRect() { return {top: this.top}; },
        scrollIntoView() { this.scrolled++; }
    };
}

/** A fetched page whose product list is the given nodes, between the two markers. */
function fetchedPage(nodes) {
    const end = {id: 'bfln-products-end'};
    const start = {id: 'bfln-products-start', nextElementSibling: nodes[0] || end};

    nodes.forEach((node, index) => { node.nextElementSibling = nodes[index + 1] || end; });

    return {getElementById: (id) => ({'bfln-products-start': start, 'bfln-products-end': end}[id] || null)};
}

/** Runs the template's script in a page and returns what it handed to BflnCore.create. */
function boot({ajax = '1', inlineAllowed = '0', pageScripts = [], core = true, readyState = 'complete'} = {}) {
    const attributes = {'data-bfln-ajax': ajax, 'data-bfln-inline': inlineAllowed};
    const marker = {
        hasAttribute: (name) => name in attributes,
        getAttribute: (name) => attributes[name],
        setAttribute: (name, value) => { attributes[name] = value; }
    };
    const state = {created: [], started: 0, activated: [], listeners: {}, made: []};
    const document = {
        readyState,
        getElementById: (id) => (id === 'bfln-products-start' ? marker : null),
        querySelectorAll: (selector) => (selector === 'script:not([src])' ? pageScripts.map((text) => script(text)) : []),
        getAttribute: () => null,
        tagName: undefined,
        addEventListener: (type, listener) => { state.listeners[type] = listener; },
        createElement: (tag) => { const made = {tagName: tag.toUpperCase(), type: '', textContent: ''}; state.made.push(made); return made; }
    };
    const window = {
        hyva: {getFormKey: () => 'KEY123', activateScripts: (element) => state.activated.push(element)}
    };

    if (core) {
        window.BflnCore = {create: (options) => { state.created.push(options); return {start: () => { state.started++; }}; }};
    }
    vm.runInNewContext(SOURCE, {window, document, Array});

    return {state, marker, document, window};
}

test('the script taken from the template carries no PHP, so its hash is the same on every page', () => {
    assert.equal(SOURCE.includes('<?'), false);
    assert.ok(SOURCE.length > 500);
});

test('it starts the shared script once, with the switch the template printed', () => {
    const on = boot();

    assert.equal(on.state.created.length, 1);
    assert.equal(on.state.started, 1);
    assert.equal(on.state.created[0].ajax, true);
    assert.equal(on.state.created[0].window, on.window);
    assert.equal(on.state.created[0].document, on.document);
    assert.equal(boot({ajax: '0'}).state.created[0].ajax, false);

    // Still loading: it waits for the page, and a second start does nothing.
    const waiting = boot({readyState: 'loading'});

    assert.equal(waiting.state.created.length, 0);
    waiting.state.listeners.DOMContentLoaded();
    waiting.state.listeners.DOMContentLoaded();
    assert.equal(waiting.state.created.length, 1);
});

test('without the shared script nothing starts and nothing throws', () => {
    assert.equal(boot({core: false}).state.created.length, 0);
});

test('under a strict policy a page whose scripts are not already running here is declined', () => {
    const {state} = boot({inlineAllowed: '0', pageScripts: ['known()', 'also known()']});
    const accept = state.created[0].accept;

    assert.equal(accept(fetchedPage([block(['known()']), block([])])), true, 'only scripts this page already runs');
    assert.equal(accept(fetchedPage([block([' known() \n'])])), true, 'compared without the surrounding space');
    assert.equal(accept(fetchedPage([block(['known()']), block(['new()'])])), false, 'a script this page has not run');
    assert.equal(accept(fetchedPage([])), true, 'an empty list has nothing to decline');
    assert.equal(accept({getElementById: () => null}), true, 'no markers: the shared script deals with that');
});

test('a script standing directly in the product list is compared too', () => {
    const {state} = boot({inlineAllowed: '0', pageScripts: ['known()']});
    const accept = state.created[0].accept;

    assert.equal(accept(fetchedPage([block([]), script('new()')])), false);
    assert.equal(accept(fetchedPage([script('known()')])), true);
    assert.equal(accept(fetchedPage([script('anything', '/static/file.js')])), true, 'a script with an address is not inline');
});

test('where inline scripts are allowed every page is accepted', () => {
    const {state} = boot({inlineAllowed: '1'});

    assert.equal(state.created[0].accept(fetchedPage([block(['new()']), script('new()')])), true);
});

test('after an update the form key is set and, where allowed, the new scripts are started', () => {
    const input = {value: 'stale'};
    const allowed = boot({inlineAllowed: '1'});
    const list = block(['x()'], [input]);
    const direct = script('direct()');
    const replaced = [];

    direct.type = 'text/x-test';
    direct.parentNode = {replaceChild: (fresh, old) => replaced.push([fresh, old])};
    allowed.state.created[0].onUpdated([block(), list, direct]);
    assert.equal(input.value, 'KEY123');
    assert.equal(allowed.state.activated.length, 2, 'Hyva starts the scripts inside the two elements');
    assert.equal(replaced.length, 1, 'and the script standing on its own is replaced with a live copy');
    assert.deepEqual([replaced[0][0].tagName, replaced[0][0].type, replaced[0][0].textContent, replaced[0][1]],
        ['SCRIPT', 'text/x-test', 'direct()', direct]);

    const strict = boot({inlineAllowed: '0'});
    const strictInput = {value: 'stale'};

    strict.state.created[0].onUpdated([block(), block(['x()'], [strictInput])]);
    assert.equal(strictInput.value, 'KEY123');
    assert.deepEqual(strict.state.activated, [], 'under a strict policy nothing is started');
});

test('after an update a list that has scrolled out of view is brought back', () => {
    const {state} = boot();
    const above = block();
    const visible = block();

    above.top = -40;
    state.created[0].onUpdated([block(), above]);
    assert.equal(above.scrolled, 1);
    state.created[0].onUpdated([block(), visible]);
    assert.equal(visible.scrolled, 0);
    state.created[0].onUpdated([above]);
    assert.equal(above.scrolled, 1, 'the navigation alone is not scrolled to');
});
