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

function script(text, src = null, type = null, inNoscript = false) {
    return {
        tagName: 'SCRIPT', textContent: text, type: type || '', parentNode: null,
        getAttribute: (name) => ({src, type}[name] ?? null),
        closest: (selector) => (selector === 'noscript' && inNoscript ? {} : null),
        hasAttribute: () => false,
        querySelectorAll: () => []
    };
}

/** An element holding inline scripts with the given texts and Alpine components with the given x-data. */
function block(texts = [], inputs = [], components = []) {
    const parts = {
        'script:not([src])': texts.map((text) => script(text)),
        '[x-data]': components.map((expression) => ({getAttribute: () => expression})),
        'input[name="form_key"]': inputs
    };

    return {
        tagName: 'DIV', top: 10, scrolled: 0, texts,
        getAttribute: () => null,
        hasAttribute: () => false,
        querySelectorAll: (selector) => parts[selector] || [],
        getBoundingClientRect() { return {top: this.top}; },
        scrollIntoView() { this.scrolled++; }
    };
}

/** A fetched page whose product list is the given nodes, between the two markers, plus page scripts outside it. */
function fetchedPage(nodes, pageScripts = []) {
    const end = {id: 'bfln-products-end'};
    const start = {id: 'bfln-products-start', nextElementSibling: nodes[0] || end};
    const inRegion = nodes.flatMap((node) => (node.tagName === 'SCRIPT' ? (node.getAttribute('src') ? [] : [node.textContent]) : node.texts));

    nodes.forEach((node, index) => { node.nextElementSibling = nodes[index + 1] || end; });

    return {
        getElementById: (id) => ({'bfln-products-start': start, 'bfln-products-end': end}[id] || null),
        hasAttribute: () => false,
        getAttribute: () => null,
        querySelectorAll: (selector) => (selector === 'script:not([src])'
            ? inRegion.map((text) => script(text)).concat(pageScripts.map((entry) => (typeof entry === 'string' ? script(entry) : entry)))
            : [])
    };
}

/** Runs the template's script in a page and returns what it handed to BflnCore.create. */
function boot({ajax = '1', inlineAllowed = '0', pageScripts = [], core = true, readyState = 'complete', storage = {}, functions = {}, inert = false} = {}) {
    const attributes = {'data-bfln-ajax': ajax, 'data-bfln-inline': inlineAllowed};
    const marker = {
        hasAttribute: (name) => name in attributes,
        getAttribute: (name) => attributes[name],
        setAttribute: (name, value) => { attributes[name] = value; }
    };
    const state = {created: [], started: 0, activated: [], listeners: {}, made: [], appended: [], registered: [], storage};
    const document = {
        readyState,
        getElementById: (id) => (id === 'bfln-products-start' ? marker : null),
        querySelectorAll: (selector) => (selector === 'script:not([src])' ? pageScripts.map((text) => script(text)) : []),
        getAttribute: () => null,
        hasAttribute: () => false,
        tagName: undefined,
        // A started script puts the functions it declares on the page, unless the test says it stays inert.
        head: {appendChild: (node) => {
            state.appended.push(node);
            if (!inert) {
                for (const match of node.textContent.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
                    window[match[1]] = () => ({});
                }
            }
        }},
        addEventListener: (type, listener) => { state.listeners[type] = listener; },
        createElement: (tag) => { const made = {tagName: tag.toUpperCase(), type: '', textContent: ''}; state.made.push(made); return made; }
    };
    const window = Object.assign({
        location: {reloads: 0, reload() { this.reloads++; }},
        Alpine: {data: (name, fn) => state.registered.push([name, typeof fn])},
        hyva: {getFormKey: () => 'KEY123', activateScripts: (element) => state.activated.push(element)}
    }, functions);

    if (storage !== null) {
        window.sessionStorage = {getItem: (key) => (key in storage ? storage[key] : null), setItem: (key, value) => { storage[key] = value; }};
    } else {
        Object.defineProperty(window, 'sessionStorage', {get() { throw new Error('storage is blocked'); }});
    }

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

test('under a strict policy a declined update is remembered, and later choices are ordinary page loads', () => {
    const storage = {};
    const first = boot({inlineAllowed: '0', pageScripts: ['known()'], storage});

    assert.equal(first.state.created[0].ajax, true);
    assert.equal(first.state.created[0].accept(fetchedPage([block(['known()'])])), true);
    assert.deepEqual(storage, {}, 'an accepted update leaves no mark');
    assert.equal(first.state.created[0].accept(fetchedPage([block(['toolbar_123()'])])), false);
    assert.deepEqual(storage, {'bfln-declined': '1'});
    // The next page of the same visit does not fetch a page it would only decline again.
    assert.equal(boot({inlineAllowed: '0', storage}).state.created[0].ajax, false);
    // The mark holds for the visit whatever the policy says on a later page.
    assert.equal(boot({inlineAllowed: '1', storage}).state.created[0].ajax, false);
    // A browser that refuses storage still works: every choice simply tries.
    const blocked = boot({inlineAllowed: '0', pageScripts: [], storage: null});

    assert.equal(blocked.state.created[0].ajax, true);
    assert.equal(blocked.state.created[0].accept(fetchedPage([block(['new()'])])), false);
});

test('a list that needs a page script this page never loaded gets it, where scripts may be started', () => {
    // The page was opened on a filter with no products: nothing defined initPriceBox.
    const priceBox = 'function initPriceBox() { return {}; }';
    const compare = 'function initCompareOnProductList() { return {}; }';
    const list = () => block(['function initToolbar_ab12() {}'], [],
        ['initPriceBox()', ' initCompareOnProductList ( ) ', 'initToolbar_ab12()', '{open: false}', 'initKnown()']);
    const allowed = boot({inlineAllowed: '1', functions: {initKnown: () => ({})}});
    const options = allowed.state.created[0];

    assert.equal(options.accept(fetchedPage([list(), list()], [priceBox, compare, 'unrelated()'])), true);
    options.onUpdated([block(), block()]);
    assert.deepEqual(allowed.state.appended.map((node) => [node.tagName, node.textContent]), [['SCRIPT', priceBox], ['SCRIPT', compare]],
        'exactly the two missing page scripts are started, once each; the toolbar function comes with the list itself');
    assert.equal(allowed.state.activated.length, 2);
    assert.deepEqual(allowed.state.registered.map((entry) => entry[0]), ['initPriceBox', 'initCompareOnProductList'],
        'and their components are registered with Alpine, whose own start has passed');
    // They are not started a second time by the next update.
    options.onUpdated([block()]);
    assert.equal(allowed.state.appended.length, 2);

    // A component the fetched page does not define anywhere: the browser loads the page instead.
    const partial = boot({inlineAllowed: '1', functions: {initKnown: () => ({})}});

    assert.equal(partial.state.created[0].accept(fetchedPage([list()], [priceBox])), false);
    partial.state.created[0].onUpdated([block()]);
    assert.equal(partial.state.appended.length, 0, 'and nothing half-collected is started');

    // Once started, a page script's component is registered with Alpine, whose own start has passed.
    const late = boot({inlineAllowed: '1'});

    assert.equal(late.state.created[0].accept(fetchedPage([block([], [], ['initWishlist'])], ['function initWishlist() {}'])), true);
    late.state.created[0].onUpdated([block()]);
    assert.deepEqual(late.state.registered, [['initWishlist', 'function']]);
    late.state.created[0].onUpdated([block()]);
    assert.equal(late.state.registered.length, 1, 'once');

    // A data block or a script inside noscript that happens to hold the words is not a page script.
    const dataOnly = boot({inlineAllowed: '1'});

    assert.equal(dataOnly.state.created[0].accept(fetchedPage([block([], [], ['initWishlist'])], [
        script('{"note": "function initWishlist() {}"}', null, 'application/ld+json'),
        script('function initWishlist() {}', null, 'text/x-magento-init'),
        script('function initWishlist() {}', null, null, true)
    ])), false);
    assert.equal(dataOnly.state.created[0].accept(fetchedPage([block([], [], ['initWishlist'])], [
        script('function initWishlist() {}', null, 'text/javascript')
    ])), true);

    // One script that declares two of the missing functions is started once; a name with a dollar sign is found.
    const both = 'function initA() {} function $initB() {}';
    const twice = boot({inlineAllowed: '1'});

    assert.equal(twice.state.created[0].accept(fetchedPage([block([], [], ['initA()', '$initB()'])], ['function initB() {}', both])), true);
    twice.state.created[0].onUpdated([block()]);
    assert.deepEqual(twice.state.appended.map((node) => node.textContent), [both]);
    assert.deepEqual(twice.state.registered.map((entry) => entry[0]), ['initA', '$initB']);
    assert.equal(twice.window.location.reloads, 0);

    // The script was started but the function never appeared (refused after all, or kept inside a closure):
    // the page is loaded, and the visit stops trying.
    const refusedStorage = {};
    const refused = boot({inlineAllowed: '1', storage: refusedStorage, inert: true});

    assert.equal(refused.state.created[0].accept(fetchedPage([block([], [], ['initWishlist'])], ['function initWishlist() {}'])), true);
    refused.state.created[0].onUpdated([block(['x()'])]);
    assert.equal(refused.window.location.reloads, 1);
    assert.deepEqual(refusedStorage, {'bfln-declined': '1'});
    assert.deepEqual(refused.state.activated, [], 'nothing more is done to a page about to be replaced');

    // A script that declares a longer name beginning the same way is not the one.
    const sidebar = 'function initWishlistOnWishlistSidebar() {}';
    const fresh = boot({inlineAllowed: '1'});

    assert.equal(fresh.state.created[0].accept(fetchedPage([block([], [], ['initWishlist'])], [sidebar])), false);
    assert.equal(fresh.state.created[0].accept(fetchedPage([block([], [], ['initWishlist'])], [sidebar, 'function  initWishlist () {}'])), true);
    fresh.state.created[0].onUpdated([block()]);
    assert.deepEqual(fresh.state.appended.map((node) => node.textContent), ['function  initWishlist () {}']);

    // A component on the element standing in the list itself is seen too.
    const direct = block([], [], []);

    direct.hasAttribute = (name) => name === 'x-data';
    direct.getAttribute = (name) => (name === 'x-data' ? 'initWishlist()' : null);
    assert.equal(options.accept(fetchedPage([direct], [])), false);
    assert.equal(options.accept(fetchedPage([direct], ['function initWishlist() {}'])), true);
});

test('under a strict policy a list that needs a page script this page never loaded is declined', () => {
    const storage = {};
    const strict = boot({inlineAllowed: '0', pageScripts: ['known()'], storage});
    const list = block(['known()'], [], ['initPriceBox()']);

    assert.equal(strict.state.created[0].accept(fetchedPage([list], ['function initPriceBox() {}'])), false);
    assert.deepEqual(storage, {'bfln-declined': '1'});
    // A theme built for a strict policy names its components without brackets; they are seen the same way.
    const bare = block(['known()'], [], ['initWishlist', ' initCompareOnProductList ']);

    assert.equal(strict.state.created[0].accept(fetchedPage([bare], [])), false);
    assert.equal(boot({inlineAllowed: '0', pageScripts: ['known()'],
        functions: {initWishlist: () => ({}), initCompareOnProductList: () => ({})}}).state.created[0].accept(fetchedPage([bare], [])), true);
    // With the function already on the page the same list is fine.
    const ready = boot({inlineAllowed: '0', pageScripts: ['known()'], functions: {initPriceBox: () => ({})}});

    assert.equal(ready.state.created[0].accept(fetchedPage([list], [])), true);
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
