/**
 * Terminal UI Component
 * Custom retro terminal — no dependencies.
 * Provides: Terminal.print(text), Terminal.onCommand(callback), Terminal.clear()
 */
(function () {
  'use strict';

  var output, input, promptEl, terminalEl, commandHistory = [], historyIndex = -1;
  var commandCallback = null;

  function init() {
    terminalEl = document.getElementById('terminal');
    output = document.getElementById('output');
    input = document.getElementById('input');
    promptEl = document.getElementById('prompt-line');

    input.addEventListener('keydown', handleKeyDown);

    // Focus input on click anywhere in terminal
    terminalEl.addEventListener('click', function () {
      input.focus();
    });

    // Keep input focused
    input.focus();
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      var cmd = input.value;

      // Clear input
      input.value = '';

      // If empty, still fire callback (for title screen Enter)
      // but don't echo or add to history
      if (cmd.trim() === '') {
        if (commandCallback) {
          commandCallback('');
        }
        return;
      }

      // Echo the command
      appendLine('> ' + cmd, 'input-echo');

      // Add to history
      commandHistory.push(cmd);
      historyIndex = commandHistory.length;

      // Fire callback
      if (commandCallback) {
        commandCallback(cmd);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = commandHistory[historyIndex];
        // Move cursor to end
        setTimeout(function () { input.selectionStart = input.selectionEnd = input.value.length; }, 0);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        input.value = commandHistory[historyIndex];
      } else {
        historyIndex = commandHistory.length;
        input.value = '';
      }
    }
  }

  function appendLine(text, className) {
    var pre = document.createElement('pre');
    pre.textContent = text;
    if (className) pre.className = className;
    output.appendChild(pre);
    scrollToBottom();
  }

  function print(text) {
    if (text == null) return;
    // Split into lines and append each as a pre element for proper wrapping
    var str = String(text);
    var pre = document.createElement('pre');
    pre.textContent = str;
    pre.className = 'game-output';
    output.appendChild(pre);
    scrollToBottom();
  }

  function printHTML(html) {
    var div = document.createElement('div');
    div.innerHTML = html;
    div.className = 'game-output';
    output.appendChild(div);
    scrollToBottom();
  }

  function clear() {
    output.innerHTML = '';
  }

  function scrollToBottom() {
    terminalEl.scrollTop = terminalEl.scrollHeight;
  }

  function onCommand(callback) {
    commandCallback = callback;
  }

  function focusInput() {
    if (input) input.focus();
  }

  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Public API
  window.Terminal = {
    print: print,
    printHTML: printHTML,
    clear: clear,
    onCommand: onCommand,
    focus: focusInput
  };
})();
