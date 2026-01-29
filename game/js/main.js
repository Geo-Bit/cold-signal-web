/**
 * Cold Signal — Game Initialization & Main Loop
 * Title screen with ENTER to start, then game loop.
 */
(function () {
  'use strict';

  var state, rooms, processorConfig;
  var gameStarted = false;

  // Helpers for banner layout
  function repeat(ch, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += ch;
    return s;
  }

  function pad(str, width) {
    while (str.length < width) str += ' ';
    return str;
  }

  function center(str, width) {
    var t = str;
    while (t.length < width) {
      t += ' ';
      if (t.length < width) t = ' ' + t;
    }
    return t.substring(0, width);
  }

  var WELCOME_BANNER = [
    '',
    '\u2554' + repeat('\u2550', 68) + '\u2557',
    '\u2551' + pad('', 68) + '\u2551',
    '\u2551' + center('              \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557     \u2588\u2588\u2588\u2588\u2588\u2588\u2557                ', 68) + '\u2551',
    '\u2551' + center('             \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551     \u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557               ', 68) + '\u2551',
    '\u2551' + center('             \u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2551  \u2588\u2588\u2551               ', 68) + '\u2551',
    '\u2551' + center('             \u2588\u2588\u2551     \u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551     \u2588\u2588\u2551  \u2588\u2588\u2551               ', 68) + '\u2551',
    '\u2551' + center('             \u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D               ', 68) + '\u2551',
    '\u2551' + center('              \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u255D                ', 68) + '\u2551',
    '\u2551' + pad('', 68) + '\u2551',
    '\u2551' + center('       \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2557            ', 68) + '\u2551',
    '\u2551' + center('       \u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D \u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2551            ', 68) + '\u2551',
    '\u2551' + center('       \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2588\u2557\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551            ', 68) + '\u2551',
    '\u2551' + center('       \u255A\u2550\u2550\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551            ', 68) + '\u2551',
    '\u2551' + center('       \u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557       ', 68) + '\u2551',
    '\u2551' + center('       \u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D       ', 68) + '\u2551',
    '\u2551' + pad('', 68) + '\u2551',
    '\u2551' + center('        OUTPOST NOCTUA :: REMOTE OPERATIONS TERMINAL         ', 68) + '\u2551',
    '\u2551' + center('           Northern Corridor Observation Authority           ', 68) + '\u2551',
    '\u2551' + pad('', 68) + '\u2551',
    '\u255A' + repeat('\u2550', 68) + '\u255D',
    '',
    '  > Initializing remote connection...',
    '  > Station status: UNMANNED - 5,479 days',
    '  > AI systems: ACTIVE',
    '  > Life support: MINIMAL',
    '',
    '  A NoCo Hackers CTF Adventure',
    '',
    '',
    '                    Press ENTER to begin...',
    ''
  ].join('\n');

  var INTRO_TEXT = [
    'You have arrived at Outpost Noctua, a remote research station',
    'in the outer reaches. Your mission: investigate why the crew',
    'has gone silent. The station awaits...',
    '',
    'Type HELP for available commands.',
    ''
  ].join('\n');

  function showTitleScreen() {
    var T = window.Terminal;

    // Show banner only — no scrolling, no input prompt text
    T.print(WELCOME_BANNER);

    // Wait for Enter to start the game
    T.onCommand(function onEnter() {
      // Any input (including empty Enter) starts the game
      gameStarted = true;
      T.clear();
      beginGame();
    });

    T.focus();
  }

  function beginGame() {
    var E = window.Engine;
    var T = window.Terminal;

    // Initialize state
    state = E.createInitialState();
    rooms = E.initRooms();
    processorConfig = E.createProcessorConfig();

    // Display intro
    T.print(INTRO_TEXT);

    // Show first room (exterior) with first_visit_text
    var room = E.getRoom(rooms, state.current_room);
    if (room) {
      var desc = '';
      if (room.first_visit_text) {
        desc += room.first_visit_text + '\n\n';
      }
      desc += E.getFullDescription(room, state);
      T.print(desc);
    }

    // Wire up game command handling
    T.onCommand(function (input) {
      handleCommand(input);
    });

    T.focus();
  }

  function handleCommand(input) {
    var E = window.Engine;
    var T = window.Terminal;

    if (!input || !input.trim()) return;

    var trimmed = input.trim();

    // Parse
    var command;
    try {
      command = E.parse(trimmed);
    } catch (err) {
      T.print(err.message || 'Unknown command.');
      return;
    }

    // Validate
    var validation = E.validate(command);
    if (!validation.valid) {
      T.print(validation.error);
      return;
    }

    // Execute
    var result = E.execute(command, state, rooms, processorConfig);

    if (result.output) {
      T.print('\n' + result.output + '\n');
    }

    // Update references (state and processorConfig may have been replaced)
    if (result.state) state = result.state;
    if (result.processorConfig) processorConfig = result.processorConfig;
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showTitleScreen);
  } else {
    showTitleScreen();
  }
})();
