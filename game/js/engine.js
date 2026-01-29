/**
 * Cold Signal — Full Game Engine (Browser Port)
 *
 * No imports / no dependencies.
 * Assumes window.GAMEDATA is already loaded (from gamedata.js).
 * Exposes everything on window.Engine.
 */
(function () {
  'use strict';

  var GD = window.GAMEDATA;

  // ====================================================================
  //  1.  STATE MANAGEMENT
  // ====================================================================

  function createInitialState() {
    return {
      current_room: 'exterior',
      inventory: [],
      flags_collected: [],
      visited_rooms: ['exterior'],
      auth_state: {
        authenticated_as: 'guest',
        access_level: 1,
        clearance: 'visitor',
        permissions: {
          archive_terminal_access: false,
          vespera_admin_mode: false,
          signal_processor_access: false
        }
      },
      game_progress: {
        introduced_to_vespera: false,
        archive_door_unlocked: false,
        archive_terminal_authenticated: false
      },
      challenge_progress: {
        archive_terminal_attempts: 0,
        vespera_dialogue_count: 0,
        signal_processor_accessed: false
      }
    };
  }

  function addToInventory(state, item) {
    if (state.inventory.indexOf(item) === -1) {
      state.inventory.push(item);
      return true;
    }
    return false;
  }

  function removeFromInventory(state, item) {
    var idx = state.inventory.indexOf(item);
    if (idx !== -1) {
      state.inventory.splice(idx, 1);
      return true;
    }
    return false;
  }

  function hasItem(state, item) {
    return state.inventory.indexOf(item) !== -1;
  }

  function collectFlag(state, flag) {
    if (state.flags_collected.indexOf(flag) === -1) {
      state.flags_collected.push(flag);
      return true;
    }
    return false;
  }

  function hasFlag(state, flag) {
    return state.flags_collected.indexOf(flag) !== -1;
  }

  function visitRoom(state, roomId) {
    if (state.visited_rooms.indexOf(roomId) === -1) {
      state.visited_rooms.push(roomId);
    }
  }

  function hasVisited(state, roomId) {
    return state.visited_rooms.indexOf(roomId) !== -1;
  }

  // ====================================================================
  //  2.  ROOM MANAGER
  // ====================================================================

  /**
   * Deep-copy GAMEDATA.ROOMS so that each room's items array is mutable.
   */
  function initRooms() {
    var rooms = {};
    var src = GD.ROOMS;
    for (var id in src) {
      if (!src.hasOwnProperty(id)) continue;
      var r = src[id];
      rooms[id] = {
        room_id: id,
        name: r.name || id.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }),
        description: r.description || '',
        short_description: r.short_description || '',
        exits: _shallowCopy(r.exits || {}),
        items: (r.items || []).slice(),
        features: _shallowCopy(r.features || {}),
        atmosphere: r.atmosphere || '',
        first_visit_text: r.first_visit_text || null
      };
    }
    return rooms;
  }

  function getRoom(rooms, id) {
    return rooms[id] || null;
  }

  function move(rooms, currentRoomId, direction) {
    var room = getRoom(rooms, currentRoomId);
    if (!room) return { success: false, message: 'Error: Invalid room.', newRoomId: null };

    if (!room.exits || !room.exits[direction]) {
      var available = Object.keys(room.exits || {}).join(', ');
      return { success: false, message: "You can't go that way. Available exits: " + available, newRoomId: null };
    }

    var newRoomId = room.exits[direction];
    var newRoom = getRoom(rooms, newRoomId);
    if (!newRoom) return { success: false, message: 'Error: Exit leads nowhere.', newRoomId: null };

    return { success: true, message: 'You move ' + direction + '.', newRoomId: newRoomId };
  }

  function takeItem(rooms, roomId, itemInput) {
    var room = getRoom(rooms, roomId);
    if (!room) return { success: false, message: 'Error: Invalid room.', actualItemId: null };

    var normalized = itemInput.toLowerCase().replace(/ /g, '_');

    for (var i = 0; i < room.items.length; i++) {
      var ri = room.items[i];
      if (ri.toLowerCase() === normalized || normalized.indexOf(ri.toLowerCase()) !== -1 || ri.toLowerCase().indexOf(normalized) !== -1) {
        room.items.splice(i, 1);
        var display = ri.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        return { success: true, message: 'You take the ' + display + '.', actualItemId: ri };
      }
    }

    // Check features
    if (room.features) {
      for (var feat in room.features) {
        if (!room.features.hasOwnProperty(feat)) continue;
        if (feat.toLowerCase() === normalized || normalized.indexOf(feat.toLowerCase()) !== -1 || feat.toLowerCase().indexOf(normalized) !== -1) {
          return { success: false, message: "You can't take the " + feat + ".", actualItemId: null };
        }
      }
    }

    return { success: false, message: 'There is no ' + itemInput + ' here.', actualItemId: null };
  }

  function dropItem(rooms, roomId, item) {
    var room = getRoom(rooms, roomId);
    if (!room) return false;
    room.items.push(item);
    return true;
  }

  function examineFeature(rooms, roomId, target) {
    var room = getRoom(rooms, roomId);
    if (!room) return { success: false, description: 'Error: Invalid room.' };

    var tLower = target.toLowerCase().replace(/ /g, '_');

    // Check features
    if (room.features) {
      for (var fname in room.features) {
        if (!room.features.hasOwnProperty(fname)) continue;
        if (tLower.indexOf(fname.toLowerCase()) !== -1 || fname.toLowerCase().indexOf(tLower) !== -1) {
          return { success: true, description: room.features[fname] };
        }
      }
    }

    // Check room items
    for (var i = 0; i < room.items.length; i++) {
      var it = room.items[i];
      if (tLower.indexOf(it.toLowerCase()) !== -1 || it.toLowerCase().indexOf(tLower) !== -1) {
        var itemName = it.replace(/_/g, ' ');
        return { success: true, description: 'The ' + itemName + ' lies here, ready to be taken.' };
      }
    }

    return { success: false, description: "You don't see any " + target + " here." };
  }

  function getFullDescription(room /*, state – optional */) {
    var lines = [];
    lines.push(room.name.toUpperCase());
    lines.push('');
    lines.push(room.description);

    if (room.atmosphere) {
      lines.push('');
      lines.push(room.atmosphere);
    }

    lines.push('');

    if (room.items && room.items.length > 0) {
      var formatted = room.items.map(function (it) {
        return it.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      });
      lines.push('You can see: ' + formatted.join(', '));
    }

    if (room.exits && Object.keys(room.exits).length > 0) {
      lines.push('Exits: ' + Object.keys(room.exits).map(function (d) { return d.toUpperCase(); }).join(', '));
    }

    return lines.join('\n');
  }

  // ====================================================================
  //  3.  ITEM MANAGER
  // ====================================================================

  function getItem(id) {
    return GD.ITEMS[id] || null;
  }

  function findItem(search) {
    var s = search.toLowerCase().replace(/ /g, '_');

    // Exact match on item_id
    if (GD.ITEMS[s]) return GD.ITEMS[s];

    // Partial match
    for (var id in GD.ITEMS) {
      if (!GD.ITEMS.hasOwnProperty(id)) continue;
      var item = GD.ITEMS[id];
      if (id.toLowerCase().indexOf(s) !== -1 ||
          (item.short_name && item.short_name.toLowerCase().indexOf(s) !== -1) ||
          (item.name && item.name.toLowerCase().indexOf(s) !== -1)) {
        return item;
      }
    }
    return null;
  }

  function useItem(itemId) {
    var item = getItem(itemId);
    if (!item) {
      // try findItem
      item = findItem(itemId);
    }
    if (!item) return null;

    if (!item.useable) {
      return "You can't use the " + (item.short_name || itemId.replace(/_/g, ' ')) + ".";
    }
    if (item.use_text) return item.use_text;
    return "You use the " + (item.short_name || itemId.replace(/_/g, ' ')) + ", but nothing happens.";
  }

  function getItemDescription(itemId) {
    var item = getItem(itemId);
    if (!item) {
      item = findItem(itemId);
    }
    if (!item) return null;

    var text = item.description || '';
    if (item.examine_text) {
      text += '\n\n' + item.examine_text;
    }
    return text;
  }

  // ====================================================================
  //  4.  DIALOGUE MANAGER
  // ====================================================================

  function getGreeting(accessLevel) {
    var data = GD.DIALOGUE.greeting;
    if (!data) return '';
    if (accessLevel >= 4 && data.level_4) return data.level_4;
    return data.level_1 || '';
  }

  function getResponse(topic, accessLevel) {
    var matched = findMatchingTopic(topic);

    if (!matched || !GD.DIALOGUE[matched]) {
      return _getDefaultResponse(accessLevel);
    }

    var topicData = GD.DIALOGUE[matched];

    // For topics like signal and processor, check level_2, level_3 too
    if (accessLevel >= 4 && topicData.level_4) return topicData.level_4;
    if (accessLevel >= 3 && topicData.level_3) return topicData.level_3;
    if (accessLevel >= 2 && topicData.level_2) return topicData.level_2;
    if (topicData.level_1) return topicData.level_1;

    // Topic has no level-specific responses
    return String(topicData);
  }

  function _getDefaultResponse(accessLevel) {
    var def = GD.DIALOGUE['default'];
    var base;
    if (def) {
      if (accessLevel >= 4 && def.level_4) {
        base = def.level_4;
      } else if (def.level_1) {
        base = def.level_1;
      } else {
        base = "QUERY: [Topic Unclear]\n\nI do not have specific information on that topic.";
      }
      return base + '\n\n' + getTopicsHint();
    }
    return "I'm not sure what you're asking about.\n\n" + getTopicsHint();
  }

  function findMatchingTopic(input) {
    var inp = input.toLowerCase().trim();

    // Remove common articles
    var normalized = inp;
    var removeWords = ['the', 'a', 'an', 'about', 'dr.', 'dr'];
    for (var w = 0; w < removeWords.length; w++) {
      var word = removeWords[w];
      normalized = normalized.replace(new RegExp('\\b' + _escapeRegex(word) + '\\b', 'g'), '');
    }
    normalized = normalized.replace(/\s+/g, ' ').trim();

    var validTopics = [];
    for (var k in GD.DIALOGUE) {
      if (!GD.DIALOGUE.hasOwnProperty(k)) continue;
      if (k.charAt(0) === '_') continue;
      if (k === 'default' || k === 'greeting' || k === 'farewell') continue;
      validTopics.push(k);
    }

    // Exact match
    if (validTopics.indexOf(normalized) !== -1) return normalized;

    // Partial: topic key contained in input (prefer longest)
    var matches = [];
    for (var i = 0; i < validTopics.length; i++) {
      if (normalized.indexOf(validTopics[i]) !== -1) {
        matches.push(validTopics[i]);
      }
    }
    if (matches.length > 0) {
      matches.sort(function (a, b) { return b.length - a.length; });
      return matches[0];
    }

    // Reverse: input contained in topic key
    for (var j = 0; j < validTopics.length; j++) {
      if (validTopics[j].indexOf(normalized) !== -1) {
        return validTopics[j];
      }
    }

    // Word overlap
    var inputWords = _toSet(normalized.split(/\s+/));
    var bestMatch = null;
    var bestOverlap = 0;
    for (var m = 0; m < validTopics.length; m++) {
      var topicWords = _toSet(validTopics[m].split(/\s+/));
      var overlap = _setIntersectionCount(inputWords, topicWords);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestMatch = validTopics[m];
      }
    }
    return bestOverlap > 0 ? bestMatch : null;
  }

  function getTopicsHint() {
    var topics = listTopics();
    if (topics.length === 0) return 'No specific topics available.';
    return 'Available topics:\n' + topics.map(function (t) { return '  - ' + t; }).join('\n');
  }

  function listTopics() {
    var topics = [];
    for (var k in GD.DIALOGUE) {
      if (!GD.DIALOGUE.hasOwnProperty(k)) continue;
      if (k.charAt(0) === '_') continue;
      if (k === 'default' || k === 'greeting' || k === 'farewell') continue;
      topics.push(k.toUpperCase());
    }
    return topics.sort();
  }

  // ====================================================================
  //  5.  ARCHIVE TERMINAL
  // ====================================================================

  function accessTerminal(state) {
    var lvl = state.auth_state.access_level;
    var clearance = state.auth_state.clearance;
    var username = state.auth_state.authenticated_as;

    if (lvl < 4) {
      var deniedMsg = GD.ARCHIVE.access_denied.message;
      deniedMsg = deniedMsg.replace(/\{auth_level_name\}/g, clearance);
      deniedMsg = deniedMsg.replace(/\{access_level\}/g, String(lvl));
      deniedMsg = deniedMsg.replace(/\{username\}/g, username);
      return deniedMsg;
    }

    var grantedMsg = GD.ARCHIVE.access_granted.message;
    grantedMsg = grantedMsg.replace(/\{username\}/g, username);
    grantedMsg = grantedMsg.replace(/\{access_level\}/g, String(lvl));
    grantedMsg += '\n\n' + (GD.ARCHIVE.entry_list || '');
    return grantedMsg;
  }

  function readEntry(number) {
    var key = 'entry_' + number;
    if (!GD.ARCHIVE[key]) {
      return 'Entry ' + number + ' not found. Available entries: 61, 62, 63';
    }
    return GD.ARCHIVE[key].content || 'Entry content not available.';
  }

  // ====================================================================
  //  6.  FILE SYSTEM (Challenge 2 — path traversal vulnerability)
  // ====================================================================

  function normalizeVirtualPath(path) {
    var parts = path.split('/');
    var normalized = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part === '..' ) {
        if (normalized.length > 0) normalized.pop();
      } else if (part === '.' || part === '') {
        continue;
      } else {
        normalized.push(part);
      }
    }
    return '/' + normalized.join('/');
  }

  function getAllowedPrefixes(accessLevel) {
    var prefixes = ['/station/public/', '/station/logs/'];
    if (accessLevel >= 4) {
      prefixes.push('/station/crew/');
      prefixes.push('/station/research/');
    }
    if (accessLevel >= 5) {
      prefixes.push('/station/restricted/');
    }
    return prefixes;
  }

  function isDirectory(path) {
    var dirPath = path.endsWith('/') ? path : path + '/';
    var files = GD.FILES;
    for (var fp in files) {
      if (!files.hasOwnProperty(fp)) continue;
      if (fp.indexOf(dirPath) === 0) return true;
    }
    return false;
  }

  function retrieveFile(path, accessLevel) {
    if (path.charAt(0) !== '/') path = '/' + path;

    // Check if directory
    if (isDirectory(path)) {
      return listDirectory(path, accessLevel);
    }

    var allowedPrefixes = getAllowedPrefixes(accessLevel);
    var normalizedPath = normalizeVirtualPath(path);
    var pathExists = GD.FILES.hasOwnProperty(normalizedPath);

    // VULNERABLE: check access on ORIGINAL path before normalization
    var hasAccess = false;
    for (var i = 0; i < allowedPrefixes.length; i++) {
      if (path.indexOf(allowedPrefixes[i]) === 0) {
        hasAccess = true;
        break;
      }
    }

    if (!hasAccess) {
      if (pathExists || isDirectory(normalizedPath)) {
        var lines = 'ACCESS DENIED: Insufficient clearance for this path.\n\n';
        lines += 'Your access level (' + accessLevel + ') allows:\n';
        for (var j = 0; j < allowedPrefixes.length; j++) {
          lines += '  - ' + allowedPrefixes[j] + '\n';
        }
        lines += '\nRequested: ' + path;
        return lines;
      }
      return 'ERROR: Path does not exist: ' + path;
    }

    // VULNERABLE: normalize AFTER access check
    if (!GD.FILES.hasOwnProperty(normalizedPath)) {
      return 'ERROR: Path does not exist: ' + path;
    }

    return GD.FILES[normalizedPath];
  }

  function listDirectory(directory, accessLevel) {
    if (directory.charAt(0) !== '/') directory = '/' + directory;
    if (!directory.endsWith('/')) directory += '/';

    var allowedPrefixes = getAllowedPrefixes(accessLevel);
    var normalizedDir = normalizeVirtualPath(directory);
    if (!normalizedDir.endsWith('/')) normalizedDir += '/';

    var dirExists = isDirectory(normalizedDir.replace(/\/$/, ''));

    // VULNERABLE: check access on ORIGINAL path
    var hasAccess = false;
    for (var i = 0; i < allowedPrefixes.length; i++) {
      if (directory.indexOf(allowedPrefixes[i]) === 0) {
        hasAccess = true;
        break;
      }
    }

    if (!hasAccess) {
      if (dirExists) {
        return 'ACCESS DENIED: Insufficient clearance for ' + directory;
      }
      return 'ERROR: Directory does not exist: ' + directory;
    }

    if (!dirExists) {
      return 'ERROR: Directory does not exist: ' + directory;
    }

    var filesInDir = [];
    for (var fp in GD.FILES) {
      if (!GD.FILES.hasOwnProperty(fp)) continue;
      if (fp.indexOf(normalizedDir) === 0) {
        var relative = fp.substring(normalizedDir.length);
        if (relative.indexOf('/') === -1) {
          filesInDir.push(relative);
        }
      }
    }

    if (filesInDir.length === 0) {
      return 'No files found in ' + normalizedDir;
    }

    filesInDir.sort();
    var lines = ['Files in ' + normalizedDir + ':'];
    for (var k = 0; k < filesInDir.length; k++) {
      lines.push('  - ' + filesInDir[k]);
    }
    return lines.join('\n');
  }

  function getDirectoryStructure(accessLevel) {
    var allowedPrefixes = getAllowedPrefixes(accessLevel);
    var lines = ['VESPERA File System - Directory Structure'];
    lines.push(new Array(46).join('\u2550')); // ═ x45
    lines.push('');

    // Collect all directories
    var dirs = {};
    for (var fp in GD.FILES) {
      if (!GD.FILES.hasOwnProperty(fp)) continue;
      var parts = fp.split('/');
      parts = parts.slice(1, parts.length - 1); // remove empty first and filename
      for (var i = 1; i <= parts.length; i++) {
        var dirPath = '/' + parts.slice(0, i).join('/') + '/';
        dirs[dirPath] = true;
      }
    }

    var sortedDirs = Object.keys(dirs).sort();

    for (var d = 0; d < sortedDirs.length; d++) {
      var directory = sortedDirs[d];

      var hasDirectAccess = false;
      var hasAccessibleChildren = false;
      for (var p = 0; p < allowedPrefixes.length; p++) {
        if (directory.indexOf(allowedPrefixes[p]) === 0) hasDirectAccess = true;
        if (allowedPrefixes[p].indexOf(directory) === 0) hasAccessibleChildren = true;
      }
      var accessible = hasDirectAccess || hasAccessibleChildren;

      // Count direct files in directory
      var fileCount = 0;
      for (var fp2 in GD.FILES) {
        if (!GD.FILES.hasOwnProperty(fp2)) continue;
        if (fp2.indexOf(directory) === 0) {
          // Only count direct children (same slash count)
          if (fp2.split('/').length === directory.split('/').length) {
            fileCount++;
          }
        }
      }

      var depth = directory.split('/').length - 2;
      var indent = '';
      for (var s = 0; s < depth; s++) indent += '  ';
      var dirParts = directory.split('/');
      var dirName = dirParts[dirParts.length - 2];

      if (accessible) {
        var status = 'ACCESSIBLE';
        if (fileCount > 0) {
          lines.push(indent + dirName + '/ (' + fileCount + ' files) [' + status + ']');
        } else {
          lines.push(indent + dirName + '/ [' + status + ']');
        }
      } else {
        lines.push(indent + dirName + '/ [RESTRICTED]');
      }
    }

    lines.push('');
    lines.push('Your access level: ' + accessLevel);
    lines.push('');
    lines.push('Use: RETRIEVE [file_path]');

    return lines.join('\n');
  }

  // ====================================================================
  //  7.  SIGNAL PROCESSOR (Challenge 3)
  // ====================================================================

  function createProcessorConfig() {
    return {
      noise_suppression: true,
      frequency_range: [20, 20000],
      safety_limiter: true,
      output_mode: 'filtered',
      debug_mode: false,
      baseline_threshold: 0.5,
      anomaly_detection: 'strict'
    };
  }

  var PARAMETER_TYPES = {
    noise_suppression: 'bool',
    frequency_range: 'list',
    safety_limiter: 'bool',
    output_mode: 'string',
    debug_mode: 'bool',
    baseline_threshold: 'float',
    anomaly_detection: 'string'
  };

  var VALID_STRING_VALUES = {
    output_mode: ['filtered', 'raw', 'debug'],
    anomaly_detection: ['strict', 'moderate', 'permissive', 'off']
  };

  var READ_ONLY_PARAMS = [
    'processor_id', 'station', 'status', 'metadata',
    'last_calibrated', 'calibrated_by', 'signal_active',
    'filter_status', 'version', 'last_modified', 'modified_by'
  ];

  function _parseBoolean(value) {
    var v = value.toLowerCase().trim();
    if (v === 'true' || v === 'yes' || v === '1' || v === 'on') return true;
    if (v === 'false' || v === 'no' || v === '0' || v === 'off') return false;
    return null;
  }

  function calibrate(config, parameter, value) {
    if (!parameter || !value) {
      return (
        'CALIBRATE command usage:\n\n' +
        'CALIBRATE <parameter> <value>\n\n' +
        'Example: CALIBRATE safety_limiter false\n\n' +
        'Use SHOW CONFIG to see available parameters.'
      );
    }

    parameter = parameter.toLowerCase().trim();

    if (READ_ONLY_PARAMS.indexOf(parameter) !== -1) {
      return "CALIBRATION ERROR: Parameter '" + parameter + "' is read-only\nSystem parameters cannot be modified.";
    }

    if (!PARAMETER_TYPES[parameter]) {
      return (
        "CALIBRATION ERROR: Unknown parameter '" + parameter + "'\n\n" +
        "Valid parameters:\n" +
        "- noise_suppression (boolean)\n" +
        "- frequency_range (array)\n" +
        "- safety_limiter (boolean)\n" +
        "- output_mode (string: filtered/raw/debug)\n" +
        "- debug_mode (boolean)\n" +
        "- baseline_threshold (float: 0.0-1.0)\n" +
        "- anomaly_detection (string: strict/moderate/permissive/off)\n\n" +
        "Use: CALIBRATE <parameter> <value>"
      );
    }

    var expectedType = PARAMETER_TYPES[parameter];
    var parsedValue;

    try {
      if (expectedType === 'bool') {
        parsedValue = _parseBoolean(value);
        if (parsedValue === null) {
          return _getTypeError(parameter, value, 'boolean (true/false)');
        }
      } else if (expectedType === 'float') {
        parsedValue = parseFloat(value);
        if (isNaN(parsedValue)) {
          return _getTypeError(parameter, value, 'float');
        }
        if (parameter === 'baseline_threshold') {
          if (parsedValue < 0.0 || parsedValue > 1.0) {
            return (
              "CALIBRATION ERROR: Value out of range for '" + parameter + "'\n" +
              "Valid range: 0 to 1\n" +
              "Received: " + parsedValue
            );
          }
        }
      } else if (expectedType === 'string') {
        parsedValue = value.toLowerCase().trim();
        if (VALID_STRING_VALUES[parameter]) {
          if (VALID_STRING_VALUES[parameter].indexOf(parsedValue) === -1) {
            return (
              "CALIBRATION ERROR: Invalid value for '" + parameter + "'\n" +
              "Valid values: " + VALID_STRING_VALUES[parameter].join(', ') + "\n" +
              "Received: '" + value + "'"
            );
          }
        }
      } else if (expectedType === 'list') {
        parsedValue = JSON.parse(value);
        if (!Array.isArray(parsedValue)) {
          return _getTypeError(parameter, value, 'array (e.g., [20, 20000])');
        }
        if (parameter === 'frequency_range') {
          if (parsedValue.length !== 2) {
            return "CALIBRATION ERROR: frequency_range must have exactly 2 elements\nReceived: " + parsedValue.length + " elements";
          }
          if (typeof parsedValue[0] !== 'number' || typeof parsedValue[1] !== 'number') {
            return "CALIBRATION ERROR: frequency_range values must be numeric\nReceived: " + JSON.stringify(parsedValue);
          }
          if (parsedValue[0] >= parsedValue[1]) {
            return "CALIBRATION ERROR: First value must be less than second\nReceived: " + JSON.stringify(parsedValue);
          }
        }
      }
    } catch (e) {
      return _getTypeError(parameter, value, expectedType);
    }

    var previousValue = config[parameter];
    config[parameter] = parsedValue;

    return (
      "Signal Processor Configuration Updated:\n" +
      "- Parameter: " + parameter + "\n" +
      "- New Value: " + JSON.stringify(parsedValue) + "\n" +
      "- Previous Value: " + JSON.stringify(previousValue) + "\n\n" +
      "Configuration change recorded.\n" +
      "Use READ SIGNAL to analyze output."
    );
  }

  function _getTypeError(parameter, value, expectedType) {
    return (
      "CALIBRATION ERROR: Invalid value for '" + parameter + "'\n" +
      "Expected: " + expectedType + "\n" +
      "Received: '" + value + "'\n\n" +
      "Use: CALIBRATE " + parameter + " <" + expectedType + ">"
    );
  }

  function readSignal(config) {
    if (isFilterBypassed(config)) {
      return GD.SIGNAL.signal_output.unfiltered.content;
    }
    return GD.SIGNAL.signal_output.filtered.content;
  }

  function getProcessorStatus(config) {
    var lines = [];
    lines.push('\u2554' + new Array(65).join('\u2550') + '\u2557');
    lines.push('\u2551         SIGNAL PROCESSOR CONFIGURATION - ANT-CTRL-01           \u2551');
    lines.push('\u255a' + new Array(65).join('\u2550') + '\u255d');
    lines.push('');
    lines.push('Calibration Parameters:');
    lines.push('  \u2022 noise_suppression: ' + config.noise_suppression);
    lines.push('  \u2022 frequency_range: ' + JSON.stringify(config.frequency_range) + ' Hz');
    lines.push('  \u2022 safety_limiter: ' + config.safety_limiter + ' \u26a0 CONTROLS ANOMALY FILTERING');
    lines.push('  \u2022 output_mode: ' + config.output_mode);
    lines.push('  \u2022 debug_mode: ' + config.debug_mode);
    lines.push('  \u2022 baseline_threshold: ' + config.baseline_threshold);
    lines.push('  \u2022 anomaly_detection: ' + config.anomaly_detection);
    lines.push('');
    lines.push('System Status:');
    lines.push('  \u2022 Signal Active: YES');
    lines.push('  \u2022 Filter Status: ACTIVE');
    lines.push('  \u2022 Last Calibrated: 2025-09-14T23:47:22Z');
    lines.push('  \u2022 Calibrated By: DR_VARN_E');
    lines.push('');
    lines.push('Processor Info:');
    lines.push('  \u2022 ID: ANT-CTRL-01');
    lines.push('  \u2022 Station: Outpost Noctua');
    lines.push('  \u2022 Version: 2.3.1');
    lines.push('');
    lines.push(new Array(66).join('\u2500'));
    lines.push('');
    lines.push('Use CALIBRATE <parameter> <value> to modify configuration');
    lines.push('Use READ SIGNAL to analyze current output');
    return lines.join('\n');
  }

  function resetProcessorConfig(config) {
    var defaults = createProcessorConfig();
    for (var k in defaults) {
      if (defaults.hasOwnProperty(k)) {
        config[k] = defaults[k];
      }
    }
    return (
      "Signal Processor Configuration Reset\n\n" +
      "All calibration parameters restored to factory defaults.\n\n" +
      "Use SHOW CONFIG to view current settings."
    );
  }

  function isFilterBypassed(config) {
    if (config.safety_limiter === false) return true;
    if (config.output_mode === 'raw' || config.output_mode === 'debug') return true;
    if (config.debug_mode === true) return true;
    if (config.anomaly_detection === 'off') return true;
    return false;
  }

  // ====================================================================
  //  8.  COMMAND PARSER
  // ====================================================================

  var DIRECTIONS = {
    n: 'north', north: 'north',
    s: 'south', south: 'south',
    e: 'east', east: 'east',
    w: 'west', west: 'west',
    u: 'up', up: 'up',
    d: 'down', down: 'down',
    ne: 'northeast', northeast: 'northeast',
    nw: 'northwest', northwest: 'northwest',
    se: 'southeast', southeast: 'southeast',
    sw: 'southwest', southwest: 'southwest'
  };

  var ALIASES = {
    l: 'look', x: 'examine', exam: 'examine', inspect: 'examine',
    i: 'inventory', inv: 'inventory',
    go: 'go', move: 'go', walk: 'go', travel: 'go',
    get: 'take', grab: 'take', pickup: 'take', pick: 'take',
    put: 'drop', leave: 'drop', place: 'drop',
    use: 'use', interact: 'use', activate: 'use',
    talk: 'talk', speak: 'talk', say: 'talk',
    ask: 'ask', query: 'ask',
    read: 'read', view: 'read',
    retrieve: 'retrieve', fetch: 'retrieve',
    calibrate: 'calibrate', config: 'calibrate', set: 'calibrate',
    signal: 'read_signal', analyze: 'read_signal', scan: 'read_signal', check: 'read_signal',
    q: 'quit', exit: 'quit', bye: 'quit',
    '?': 'help', h: 'help',
    restore: 'load'
  };

  var ARTICLES = { a: true, an: true, the: true };
  var PREPOSITIONS = { at: true, to: true, with: true, on: true, 'in': true, from: true, using: true, about: true };

  function _tokenize(inputText) {
    var text = inputText.trim().replace(/\s+/g, ' ');
    text = text.replace(/[.,!?;:]/g, '');
    return text.split(/\s+/).filter(function (t) { return t.length > 0; });
  }

  function parse(inputText) {
    if (!inputText || !inputText.trim()) throw new Error('Empty command');

    // Special handling for RETRIEVE/FETCH
    var inputLower = inputText.trim().toLowerCase();
    if (inputLower.indexOf('retrieve') === 0 || inputLower.indexOf('fetch') === 0) {
      var parts = inputText.trim().split(/\s+(.+)/);
      return {
        action: 'retrieve',
        target: parts[1] || null,
        parameters: {}
      };
    }

    var tokens = _tokenize(inputText);
    if (tokens.length === 0) throw new Error('Empty command');

    var rawAction = tokens[0].toLowerCase();

    // Direction shorthand
    if (DIRECTIONS[rawAction]) {
      return { action: 'go', target: DIRECTIONS[rawAction], parameters: {} };
    }

    // Alias
    var action = ALIASES[rawAction] || rawAction;

    // Single word
    if (tokens.length === 1) {
      return { action: action, target: null, parameters: {} };
    }

    // READ SIGNAL / READ ANTENNA
    if (action === 'read' && tokens.length >= 2 && (tokens[1].toLowerCase() === 'signal' || tokens[1].toLowerCase() === 'antenna')) {
      return { action: 'read_signal', target: null, parameters: {} };
    }

    // CALIBRATE
    if (action === 'calibrate' && tokens.length >= 3) {
      var param = tokens[1];
      var val = tokens.slice(2).join(' ');
      return { action: action, target: param, parameters: { value: val } };
    }
    if (action === 'calibrate' && tokens.length === 2) {
      return { action: action, target: tokens[1], parameters: {} };
    }

    // read_signal alias already resolved
    if (action === 'read_signal') {
      return { action: action, target: null, parameters: {} };
    }

    // GO direction
    if (action === 'go' && tokens.length >= 2) {
      var dir = tokens[1].toLowerCase();
      var resolved = DIRECTIONS[dir] || dir;
      return { action: action, target: resolved, parameters: {} };
    }

    // Commands with articles / prepositions
    if (['look', 'examine', 'take', 'drop', 'use', 'talk', 'ask', 'read'].indexOf(action) !== -1) {
      var remaining = [];
      for (var i = 1; i < tokens.length; i++) {
        if (!ARTICLES[tokens[i].toLowerCase()]) {
          remaining.push(tokens[i]);
        }
      }
      if (remaining.length === 0) {
        return { action: action, target: null, parameters: {} };
      }

      var prepIdx = -1;
      var prep = null;
      for (var pi = 0; pi < remaining.length; pi++) {
        if (PREPOSITIONS[remaining[pi].toLowerCase()]) {
          prepIdx = pi;
          prep = remaining[pi].toLowerCase();
          break;
        }
      }

      if (prepIdx !== -1) {
        var target = remaining.slice(0, prepIdx).join(' ');
        var indirect = remaining.slice(prepIdx + 1).join(' ');
        var params = {};
        params[prep] = indirect;
        return { action: action, target: target, parameters: params };
      }

      return { action: action, target: remaining.join(' '), parameters: {} };
    }

    // SHOW CONFIG / RESET CONFIG
    if (action === 'show' && tokens.length >= 2 && (tokens[1].toLowerCase() === 'config' || tokens[1].toLowerCase() === 'calibration')) {
      return { action: 'show_config', target: null, parameters: {} };
    }
    if (action === 'reset' && tokens.length >= 2 && (tokens[1].toLowerCase() === 'config' || tokens[1].toLowerCase() === 'calibration')) {
      return { action: 'reset_config', target: null, parameters: {} };
    }
    if (action === 'restore' && tokens.length >= 2 && tokens[1].toLowerCase() === 'defaults') {
      return { action: 'reset_config', target: null, parameters: {} };
    }

    // LIST SAVES -> list_saves
    if (action === 'list' && tokens.length >= 2 && tokens[1].toLowerCase() === 'saves') {
      return { action: 'list_saves', target: null, parameters: {} };
    }

    // Default: everything after action is target
    var defTarget = tokens.slice(1).join(' ');
    return { action: action, target: defTarget || null, parameters: {} };
  }

  function validate(command) {
    var validActions = [
      'look', 'examine', 'go', 'take', 'drop', 'use',
      'inventory', 'help', 'quit', 'talk', 'ask', 'read',
      'retrieve', 'status', 'calibrate', 'read_signal',
      'show_config', 'reset_config', 'save', 'load', 'list_saves',
      'bypass'
    ];

    if (validActions.indexOf(command.action) === -1) {
      return { valid: false, error: 'Unknown command: ' + command.action };
    }

    if (command.action === 'go') {
      if (!command.target) {
        return { valid: false, error: 'Go where? Specify a direction.' };
      }
      var validDirs = {};
      for (var dk in DIRECTIONS) {
        if (DIRECTIONS.hasOwnProperty(dk)) validDirs[DIRECTIONS[dk]] = true;
      }
      if (!validDirs[command.target]) {
        return { valid: false, error: 'Invalid direction: ' + command.target };
      }
    }

    return { valid: true, error: '' };
  }

  // ====================================================================
  //  9.  COMMAND EXECUTOR
  // ====================================================================

  /**
   * Fuzzy-find item in inventory.
   */
  function _findItemInInventory(state, itemInput) {
    var normalized = itemInput.toLowerCase().replace(/ /g, '_');
    for (var i = 0; i < state.inventory.length; i++) {
      var inv = state.inventory[i];
      if (inv.toLowerCase() === normalized || inv.toLowerCase().indexOf(normalized) !== -1) {
        return inv;
      }
    }
    return null;
  }

  // --- Enhanced item interactions ---

  function _useFlashlightInRoom(roomId) {
    var reveals = {
      maintenance_corridor:
        "You sweep the beam across the maintenance corridor. In the enhanced light, you notice\n" +
        "something you missed before:\n\n" +
        "Behind an access panel, fiber optic cables glow faintly with data traffic. One bundle\n" +
        "pulses more actively than the others\u2014the line labeled \"ARCHIVE SNAPSHOT BACKUP.\" Data\n" +
        "is still flowing. The archive system is very much alive.\n\n" +
        "Near the floor, your light catches scratches in the metal you couldn't see before. Not\n" +
        "random wear\u2014deliberate marks: \"7.83 - 23:52 - THRESHOLD\"",
      storage_bay:
        "You direct the beam into the shadows of the storage bay. The light reveals details\n" +
        "obscured by the dim emergency lighting:\n\n" +
        "The open shipping container SC-07 has a false bottom. Your light catches the seam where\n" +
        "it was lifted. Whatever Dr. Varn removed wasn't just sitting on the floor\u2014it was hidden.\n" +
        "Deliberately concealed even from her own crew.\n\n" +
        "On the underside of a shelf, barely visible: a small notation in Dr. Varn's handwriting,\n" +
        "\"If you need the filters, you haven't understood yet.\"",
      observation_deck:
        "The beam reflects off the observation windows, but as you angle it, something strange\n" +
        "happens\u2014the reflection doesn't behave quite right. At certain angles, you see patterns\n" +
        "in the glass that weren't there before. Frequency interference etched into the material\n" +
        "itself. The windows aren't just for looking out. They've been recording something."
    };
    return reveals[roomId] || null;
  }

  function _useDatapad() {
    return (
      "You power on the station datapad. It opens to the last accessed file\u2014a station layout\n" +
      "diagram someone left on screen:\n\n" +
      "    OUTPOST NOCTUA - BASIC LAYOUT\n\n" +
      "            [Observation Deck]\n" +
      "                    |\n" +
      "        [Crew]--[Operations]--[Archive]--[Antenna]\n" +
      "          |         |                        |\n" +
      "      [Storage]-[Landing]----[Maintenance]---+\n\n" +
      "The battery indicator blinks. The device powers down before you can explore further.\n\n" +
      "At least you have a general sense of the station's layout now."
    );
  }

  function _useAccessCardInRoom(roomId, state) {
    if (roomId === 'archive_chamber') {
      return (
        "You swipe the gold access card through a nearby terminal reader.\n\n" +
        "\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557\n" +
        "\u2551  AUTHENTICATION PROCESSING...                    \u2551\n" +
        "\u2551                                                  \u2551\n" +
        "\u2551  Card ID: VARN_E_PI_04                          \u2551\n" +
        "\u2551  Clearance: Level 4 (PRINCIPAL INVESTIGATOR)    \u2551\n" +
        "\u2551  Status: VALID - Credentials Recognized         \u2551\n" +
        "\u2551                                                  \u2551\n" +
        "\u2551  Welcome, Dr. Varn.                             \u2551\n" +
        "\u2551                                                  \u2551\n" +
        "\u2551  Last session: 2025-09-14 23:47:18Z             \u2551\n" +
        "\u2551  Session status: SUSPENDED                      \u2551\n" +
        "\u255a\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255d\n\n" +
        "The card's authentication confirms Dr. Varn's credentials are valid. However, the card\n" +
        "itself doesn't change your actual clearance level\u2014it just proves her identity.\n\n" +
        "To truly access the archive at Level 4, you'd need to restore her session state..."
      );
    }
    if (roomId === 'operations_hub') {
      return (
        "You swipe the access card through the VESPERA terminal reader.\n\n" +
        "AUTHENTICATION: Dr. E. Varn credentials verified.\n" +
        "However, this terminal is accessible to all station personnel.\n" +
        "The card provides no additional access here.\n\n" +
        "Interesting though\u2014VESPERA's response time just increased by 2.3 seconds.\n" +
        "She noticed whose credentials you're carrying."
      );
    }
    return null;
  }

  function _showPhotoToVespera() {
    return (
      "You hold the crew photograph up to VESPERA's camera interface.\n\n" +
      "[Response delay: 4.7 seconds - unusually long]\n\n" +
      "QUERY: Image Recognition Request\n\n" +
      "I recognize all six individuals. Dr. Elias Varn. Dr. Kenji Matsuda. Dr. Sarah Chen.\n" +
      "Marcus Webb. Dr. Anya Volkov. Technician Luis Guerrero.\n\n" +
      "This photograph was taken on 2024-11-03 at 14:22 local time. First day of the research\n" +
      "rotation. Ambient temperature: -18\u00B0C. Matsuda made a joke about freezing before they\n" +
      "even started. Webb said something about \"listening to nothing in nowhere.\" They laughed.\n\n" +
      "They had no idea what they would eventually hear.\n\n" +
      "[Response delay: 5.1 seconds]\n\n" +
      "I preserve memories even when the people who made them are gone. This is what I was\n" +
      "designed to do. But preservation and prevention are different things. I could not stop\n" +
      "them. I am not certain I should have.\n\n" +
      "The photograph date was four months before the event. They look hopeful. Curious.\n" +
      "Ready for discovery. They were not ready for what they would discover."
    );
  }

  function _readLogInAntennaControl() {
    return (
      "You open Dr. Varn's observation log while standing in Antenna Control\u2014the very room\n" +
      "where she wrote her final entries.\n\n" +
      "Reading her words here, surrounded by the equipment she used, the signal processor\n" +
      "still displaying the 7.83 Hz carrier wave... you understand her progression. From\n" +
      "skepticism to curiosity to certainty.\n\n" +
      "The log falls open to September 14, 14:23Z. The entry about tonight. About disabling\n" +
      "the filters. You look up at the signal processor. The same processor. The same filters.\n" +
      "Still running. Still suppressing.\n\n" +
      "You could do what she did. You have her notes. The equipment is here. The choice is\n" +
      "here.\n\n" +
      "The observation log feels heavier in your hands now."
    );
  }

  function _checkEnhancedItemUse(itemId, state) {
    var roomId = state.current_room;

    // 1. Flashlight
    if (itemId === 'flashlight') {
      return _useFlashlightInRoom(roomId);
    }

    // 2. Datapad
    if (itemId === 'datapad' || itemId === 'personal_datapad') {
      return _useDatapad();
    }

    // 3. Access card
    if (itemId === 'access_card_gold') {
      return _useAccessCardInRoom(roomId, state);
    }

    // 4. Crew photo in operations_hub
    if (itemId === 'crew_photo' && roomId === 'operations_hub') {
      return _showPhotoToVespera();
    }

    // 5. Observation log in antenna_control
    if (itemId === 'observation_log' && roomId === 'antenna_control') {
      return _readLogInAntennaControl();
    }

    return null;
  }

  // --- Help text ---

  function _getHelpText() {
    return (
      "AVAILABLE COMMANDS:\n\n" +
      "Movement:\n" +
      "  GO [direction]     - Move in a direction (NORTH, SOUTH, EAST, WEST, UP, DOWN)\n" +
      "  N, S, E, W, U, D   - Shortcuts for directions\n\n" +
      "Interaction:\n" +
      "  LOOK               - Examine current location\n" +
      "  EXAMINE [object]   - Look at something closely\n" +
      "  TAKE [item]        - Pick up an item\n" +
      "  DROP [item]        - Drop an item\n" +
      "  USE [item]         - Use an item or interact with terminals\n" +
      "  INVENTORY (I)      - Show what you're carrying\n" +
      "  TALK [to person]   - Speak with someone (VESPERA)\n" +
      "  ASK [about topic]  - Ask VESPERA about specific topics\n" +
      "  READ [entry/item]  - Read archive entries or documents\n" +
      "  RETRIEVE [path]    - Retrieve files from VESPERA file system\n\n" +
      "Signal Processing:\n" +
      "  CALIBRATE [parameter] [value] - Modify processor configuration\n" +
      "  READ SIGNAL             - Analyze current signal output\n" +
      "  SHOW CONFIG             - Display processor configuration\n" +
      "  RESET CONFIG            - Reset to default settings\n\n" +
      "Session:\n" +
      "  STATUS             - Show your current status\n\n" +
      "Game:\n" +
      "  HELP (?)           - Show this help\n" +
      "  (Close the browser tab to end your session)\n\n" +
      "Examples:\n" +
      "  > go north\n" +
      "  > n\n" +
      "  > take flashlight\n" +
      "  > examine terminal\n" +
      "  > use access card\n" +
      "  > retrieve list files\n" +
      "  > retrieve /station/public/welcome.txt"
    );
  }

  // --- Main execute ---

  function execute(command, state, rooms, processorConfig) {
    var action = command.action;
    var result;

    switch (action) {
      case 'help':
        return { output: _getHelpText(), state: state, processorConfig: processorConfig };

      case 'look':
        result = _cmdLook(command, state, rooms);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'examine':
        result = _cmdExamine(command, state, rooms);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'go':
        result = _cmdGo(command, state, rooms);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'take':
        result = _cmdTake(command, state, rooms);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'drop':
        result = _cmdDrop(command, state, rooms);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'use':
        result = _cmdUse(command, state, rooms);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'inventory':
        result = _cmdInventory(state);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'talk':
        result = _cmdTalk(command, state, rooms);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'ask':
        result = _cmdAsk(command, state);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'read':
        result = _cmdRead(command, state);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'retrieve':
        result = _cmdRetrieve(command, state);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'calibrate':
        result = _cmdCalibrate(command, state, processorConfig);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'read_signal':
        result = _cmdReadSignal(command, state, processorConfig);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'show_config':
        result = _cmdShowConfig(command, state, processorConfig);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'reset_config':
        result = _cmdResetConfig(command, state, processorConfig);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'status':
        result = _cmdStatus(state);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'bypass':
        result = _cmdBypass(command, state);
        return { output: result, state: state, processorConfig: processorConfig };

      case 'quit':
        return { output: 'Goodbye. Close the browser tab to end your session.', state: state, processorConfig: processorConfig };

      default:
        return { output: 'Unknown command: ' + action, state: state, processorConfig: processorConfig };
    }
  }

  // --- Command implementations ---

  function _cmdLook(command, state, rooms) {
    var room = getRoom(rooms, state.current_room);
    if (!room) return 'Error: You are nowhere.';

    var firstVisit = !hasVisited(state, state.current_room);
    visitRoom(state, state.current_room);

    if (firstVisit && room.first_visit_text) {
      return room.first_visit_text + '\n\n' + getFullDescription(room);
    }

    if (!firstVisit && room.short_description) {
      var desc = room.name + '\n' + room.short_description + '\n';
      if ((room.items && room.items.length > 0) || (room.exits && Object.keys(room.exits).length > 0)) {
        desc += '\n';
        if (room.items && room.items.length > 0) {
          var itemsStr = room.items.map(function (it) {
            return it.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
          }).join(', ');
          desc += 'You can see: ' + itemsStr + '\n';
        }
        if (room.exits && Object.keys(room.exits).length > 0) {
          desc += 'Exits: ' + Object.keys(room.exits).map(function (d) { return d.toUpperCase(); }).join(', ');
        }
      }
      return desc;
    }

    return getFullDescription(room);
  }

  function _cmdExamine(command, state, rooms) {
    if (!command.target) return 'Examine what?';

    // Check inventory first
    var actualItem = _findItemInInventory(state, command.target);
    if (actualItem) {
      var item = findItem(actualItem);
      if (item) {
        var text = item.description || '';
        if (item.examine_text) text += '\n\n' + item.examine_text;
        return text;
      }
      var itemDisplay = actualItem.replace(/_/g, ' ').toLowerCase();
      return 'The ' + itemDisplay + ' seems ordinary.';
    }

    // Check room items
    var room = getRoom(rooms, state.current_room);
    if (room) {
      var targetNorm = command.target.toLowerCase().replace(/ /g, '_');
      for (var i = 0; i < room.items.length; i++) {
        var rid = room.items[i];
        if (targetNorm.indexOf(rid.toLowerCase()) !== -1 || rid.toLowerCase().indexOf(targetNorm) !== -1) {
          var roomItem = getItem(rid);
          if (roomItem) {
            var txt = roomItem.description || '';
            if (roomItem.examine_text) txt += '\n\n' + roomItem.examine_text;
            return txt;
          }
        }
      }
    }

    // Check features
    var feat = examineFeature(rooms, state.current_room, command.target);
    return feat.description;
  }

  function _cmdGo(command, state, rooms) {
    if (!command.target) return 'Go where?';

    var result = move(rooms, state.current_room, command.target);
    if (result.success && result.newRoomId) {
      state.current_room = result.newRoomId;
      visitRoom(state, result.newRoomId);

      var room = getRoom(rooms, result.newRoomId);
      if (room) {
        return result.message + '\n\n' + getFullDescription(room);
      }
    }
    return result.message;
  }

  function _cmdTake(command, state, rooms) {
    if (!command.target) return 'Take what?';

    var result = takeItem(rooms, state.current_room, command.target);
    if (result.success && result.actualItemId) {
      addToInventory(state, result.actualItemId);
    }
    return result.message;
  }

  function _cmdDrop(command, state, rooms) {
    if (!command.target) return 'Drop what?';

    var actual = _findItemInInventory(state, command.target);
    if (!actual) return "You don't have a " + command.target + ".";

    removeFromInventory(state, actual);
    dropItem(rooms, state.current_room, actual);
    var disp = actual.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return 'You drop the ' + disp + '.';
  }

  function _cmdUse(command, state, rooms) {
    if (!command.target) return 'Use what?';

    var targetLower = command.target.toLowerCase();

    // Terminal usage
    if (targetLower.indexOf('terminal') !== -1) {
      var room = getRoom(rooms, state.current_room);

      // Archive Terminal
      if (room && room.room_id === 'archive_chamber' && targetLower.indexOf('archive') !== -1) {
        var msg = accessTerminal(state);
        // Check for flag
        if (msg.indexOf('NoCo{') !== -1) {
          var flagMatch = msg.match(/NoCo\{[^}]+\}/);
          if (flagMatch) collectFlag(state, flagMatch[0]);
        }
        return msg;
      }

      // VESPERA Terminal
      if (room && room.room_id === 'operations_hub' && targetLower.indexOf('vespera') !== -1) {
        return _cmdTalk(command, state, rooms);
      }

      return "There's no terminal here to use.";
    }

    // Check inventory
    var actual = _findItemInInventory(state, command.target);
    if (!actual) return "You don't have a " + command.target + ".";

    // Enhanced interactions
    var enhanced = _checkEnhancedItemUse(actual, state);
    if (enhanced) return enhanced;

    // Default item use
    var item = findItem(actual);
    if (item) {
      var useResult = null;
      if (!item.useable) {
        useResult = "You can't use the " + (item.short_name || actual.replace(/_/g, ' ')) + ".";
      } else if (item.use_text) {
        useResult = item.use_text;
      } else {
        useResult = "You use the " + (item.short_name || actual.replace(/_/g, ' ')) + ", but nothing happens.";
      }
      if (useResult) return useResult;
    }

    var itemDisp = actual.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return "You can't use the " + itemDisp + " here.";
  }

  function _cmdInventory(state) {
    if (!state.inventory || state.inventory.length === 0) {
      return 'You are carrying nothing.';
    }
    var items = state.inventory.map(function (it) {
      return '  - ' + it.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    });
    return 'You are carrying:\n' + items.join('\n');
  }

  function _cmdTalk(command, state, rooms) {
    var target = command.target || 'vespera';
    var room = getRoom(rooms, state.current_room);

    if (target.toLowerCase().indexOf('vespera') !== -1 || (room && room.room_id === 'operations_hub')) {
      if (!state.game_progress.introduced_to_vespera) {
        var msg = getGreeting(state.auth_state.access_level);
        state.game_progress.introduced_to_vespera = true;
        return msg;
      }
      return (
        "VESPERA is ready to respond to inquiries.\n\n" +
        "Use: ASK VESPERA ABOUT [topic]\n\n" +
        getTopicsHint() +
        "\n\nOr use: TALK to hear greeting again."
      );
    }

    return "There is no " + target + " here to talk to.";
  }

  function _cmdAsk(command, state) {
    var topic;
    if (command.parameters && command.parameters.about) {
      topic = command.parameters.about;
    } else if (command.target) {
      var tLow = command.target.toLowerCase();
      topic = tLow.replace(/vespera/g, '').replace(/about/g, '').trim();
    } else {
      return 'Ask about what? Use: ASK VESPERA ABOUT [topic]';
    }

    if (!topic) {
      return 'Ask about what topic?\n' + getTopicsHint();
    }

    return getResponse(topic, state.auth_state.access_level);
  }

  function _cmdRead(command, state) {
    if (!command.target) return 'Read what?';

    var targetLower = command.target.toLowerCase();

    // Archive entry
    if (targetLower.indexOf('entry') !== -1) {
      if (state.current_room !== 'archive_chamber') {
        return 'You need to be at the Archive Terminal to read entries.';
      }
      if (state.auth_state.access_level < 4) {
        return 'ACCESS DENIED: Archive Terminal requires Level 4 clearance.';
      }

      var parts = targetLower.split(/\s+/);
      for (var i = 0; i < parts.length; i++) {
        if (/^\d+$/.test(parts[i])) {
          var entryNum = parseInt(parts[i], 10);
          var result = readEntry(entryNum);
          if (result) {
            // Check for flag in entry 63
            if (entryNum === 63 && result.indexOf('NoCo{') !== -1) {
              var flagMatch = result.match(/NoCo\{[^}]+\}/);
              if (flagMatch) {
                collectFlag(state, flagMatch[0]);
              }
            }
            return result;
          }
        }
      }
      return 'Specify an entry number: READ ENTRY [number]';
    }

    // Try reading an inventory item
    var actual = _findItemInInventory(state, command.target);
    if (actual) {
      var item = findItem(actual);
      if (item) {
        var txt = item.description || '';
        if (item.examine_text) txt += '\n\n' + item.examine_text;
        return txt;
      }
    }

    return "You can't read the " + command.target + ".";
  }

  function _cmdRetrieve(command, state) {
    if (!command.target) {
      return (
        "VESPERA File System - Usage:\n\n" +
        "RETRIEVE [file_path]       - Retrieve a file\n" +
        "RETRIEVE [directory/]      - List files in a directory\n" +
        "RETRIEVE LIST FILES        - Show directory structure\n\n" +
        "Examples:\n" +
        "  RETRIEVE /station/public/welcome.txt\n" +
        "  RETRIEVE /station/logs/\n" +
        "  RETRIEVE LIST FILES"
      );
    }

    var targetLower = command.target.toLowerCase();

    // LIST FILES
    if (targetLower.indexOf('list') !== -1 && targetLower.indexOf('file') !== -1) {
      return getDirectoryStructure(state.auth_state.access_level);
    }

    var filePath = command.target;
    var result;
    if (filePath.charAt(filePath.length - 1) === '/') {
      result = listDirectory(filePath, state.auth_state.access_level);
    } else {
      result = retrieveFile(filePath, state.auth_state.access_level);
    }

    // Check for flag 2
    if (result.indexOf('NoCo{vespera_hides_her_secrets_poorly}') !== -1) {
      var flagMatch = result.match(/NoCo\{[^}]+\}/);
      if (flagMatch) {
        var flag = flagMatch[0];
        if (collectFlag(state, flag)) {
          result += '\n\n' + new Array(71).join('=');
          result += '\n FLAG CAPTURED!';
          result += '\n ' + flag;
          result += '\n' + new Array(71).join('=');
          result += '\n\nChallenge 2 Complete: Path Traversal Exploit';
        }
      }
    }

    return result;
  }

  function _cmdCalibrate(command, state, processorConfig) {
    if (state.current_room !== 'antenna_control') {
      return "You are not at the signal processor console.\n\nThe signal processor is located in Antenna Control.";
    }

    var parameter = command.target;
    var value = command.parameters ? command.parameters.value : null;

    if (!parameter) {
      return "Specify a parameter: CALIBRATE [parameter] [value]\n\nUse SHOW CONFIG to see available parameters.";
    }
    if (!value) {
      return "Specify a value for '" + parameter + "': CALIBRATE " + parameter + " [value]";
    }

    return calibrate(processorConfig, parameter, value);
  }

  function _cmdReadSignal(command, state, processorConfig) {
    if (state.current_room !== 'antenna_control') {
      return "You are not at the signal processor console.\n\nThe signal processor is located in Antenna Control.";
    }

    var result = readSignal(processorConfig);

    // Check for flag 3
    if (result.indexOf('NoCo{raw_signal_reveals_hidden_truth}') !== -1) {
      var flagMatch = result.match(/NoCo\{[^}]+\}/);
      if (flagMatch) {
        var flag = flagMatch[0];
        if (collectFlag(state, flag)) {
          result += '\n\n' + new Array(71).join('=');
          result += '\n FLAG CAPTURED!';
          result += '\n ' + flag;
          result += '\n' + new Array(71).join('=');
          result += '\n\nChallenge 3 Complete: Signal Processor Configuration Manipulation';
          result += '\n\nYou successfully bypassed the signal processor\'s safety filters';
          result += '\nby manipulating its configuration. Dr. Varn\'s hidden message has';
          result += '\nbeen revealed.';
        }
      }
    }

    return result;
  }

  function _cmdShowConfig(command, state, processorConfig) {
    if (state.current_room !== 'antenna_control') {
      return "You are not at the signal processor console.\n\nThe signal processor is located in Antenna Control.";
    }
    return getProcessorStatus(processorConfig);
  }

  function _cmdResetConfig(command, state, processorConfig) {
    if (state.current_room !== 'antenna_control') {
      return "You are not at the signal processor console.\n\nThe signal processor is located in Antenna Control.";
    }
    return resetProcessorConfig(processorConfig);
  }

  function _cmdStatus(state) {
    var auth = state.auth_state;
    var lines = [];
    lines.push('=== STATUS ===');
    lines.push('Authenticated as: ' + auth.authenticated_as);
    lines.push('Access Level: ' + auth.access_level + ' (' + auth.clearance + ')');
    lines.push('');
    lines.push('Permissions:');
    for (var perm in auth.permissions) {
      if (!auth.permissions.hasOwnProperty(perm)) continue;
      var status = auth.permissions[perm] ? 'GRANTED' : 'DENIED';
      lines.push('  - ' + perm + ': ' + status);
    }
    lines.push('');
    lines.push('Current Location: ' + state.current_room);
    lines.push('Items Carried: ' + state.inventory.length);
    lines.push('Flags Collected: ' + state.flags_collected.length);
    return lines.join('\n');
  }

  function _cmdBypass(command, state) {
    if (state.current_room !== 'archive_chamber') {
      return 'Nothing happens.';
    }

    // Upgrade auth
    state.auth_state.authenticated_as = 'Dr. Varn';
    state.auth_state.access_level = 4;
    state.auth_state.clearance = 'researcher';
    state.auth_state.permissions.archive_terminal_access = true;
    state.game_progress.archive_terminal_authenticated = true;

    return (
      "ARCHIVE TERMINAL - SESSION RESTORATION\n\n" +
      "Restoring session snapshot from 2025-09-14 23:47:18Z...\n\n" +
      "Session loaded successfully.\n" +
      "Authenticated as: Dr. Elias Varn\n" +
      "Access Level: 4 (Principal Investigator)\n" +
      "Clearance: Researcher\n\n" +
      "Challenge 1 Simulation: Auth state manipulation successful.\n\n" +
      "You now have Level 4 access. Use the Archive Terminal to read Dr. Varn's research logs."
    );
  }

  // ====================================================================
  //  UTILITY HELPERS
  // ====================================================================

  function _shallowCopy(obj) {
    var copy = {};
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) copy[k] = obj[k];
    }
    return copy;
  }

  function _escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function _toSet(arr) {
    var s = {};
    for (var i = 0; i < arr.length; i++) {
      if (arr[i]) s[arr[i]] = true;
    }
    return s;
  }

  function _setIntersectionCount(a, b) {
    var count = 0;
    for (var k in a) {
      if (a.hasOwnProperty(k) && b.hasOwnProperty(k)) count++;
    }
    return count;
  }

  // String.prototype.endsWith polyfill for older browsers
  if (!String.prototype.endsWith) {
    String.prototype.endsWith = function (search) {
      return this.substring(this.length - search.length) === search;
    };
  }

  // ====================================================================
  //  PUBLIC API
  // ====================================================================

  window.Engine = {
    // State
    createInitialState: createInitialState,
    addToInventory: addToInventory,
    removeFromInventory: removeFromInventory,
    hasItem: hasItem,
    collectFlag: collectFlag,
    hasFlag: hasFlag,
    visitRoom: visitRoom,
    hasVisited: hasVisited,

    // Rooms
    initRooms: initRooms,
    getRoom: getRoom,
    move: move,
    takeItem: takeItem,
    dropItem: dropItem,
    examineFeature: examineFeature,
    getFullDescription: getFullDescription,

    // Items
    getItem: getItem,
    findItem: findItem,
    useItem: useItem,
    getItemDescription: getItemDescription,

    // Dialogue
    getGreeting: getGreeting,
    getResponse: getResponse,
    findMatchingTopic: findMatchingTopic,
    getTopicsHint: getTopicsHint,
    listTopics: listTopics,

    // Archive
    accessTerminal: accessTerminal,
    readEntry: readEntry,

    // File System
    retrieveFile: retrieveFile,
    listDirectory: listDirectory,
    getDirectoryStructure: getDirectoryStructure,
    normalizeVirtualPath: normalizeVirtualPath,
    getAllowedPrefixes: getAllowedPrefixes,
    isDirectory: isDirectory,

    // Signal Processor
    createProcessorConfig: createProcessorConfig,
    calibrate: calibrate,
    readSignal: readSignal,
    getProcessorStatus: getProcessorStatus,
    resetProcessorConfig: resetProcessorConfig,
    isFilterBypassed: isFilterBypassed,

    // Parser
    parse: parse,
    validate: validate,

    // Executor
    execute: execute
  };

})();
