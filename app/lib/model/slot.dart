// Shared domain model — the contract every module depends on.
// Mirrors the Host WS `state` payload (host/state/agent-state-store.js snapshot).

/// Agent light states, matching the Host + web toy exactly.
enum AgentState { idle, thinking, complete, needsInput, error, unknown }

AgentState agentStateFromWire(String? s) {
  switch (s) {
    case 'idle':
      return AgentState.idle;
    case 'thinking':
      return AgentState.thinking;
    case 'complete':
      return AgentState.complete;
    case 'needs_input':
      return AgentState.needsInput;
    case 'error':
      return AgentState.error;
    default:
      return AgentState.unknown;
  }
}

/// One tracked agent session occupying a slot (0..5).
class SlotState {
  final int slotId;
  final String? label; // project name (cwd basename)
  final AgentState state;

  /// Whether the Host can inject keys back (session is in tmux or cmux).
  /// A session in neither can be monitored but not remotely approved.
  final bool canInject;

  const SlotState({
    required this.slotId,
    required this.label,
    required this.state,
    required this.canInject,
  });

  factory SlotState.fromJson(Map<String, dynamic> j) => SlotState(
        slotId: j['slotId'] as int,
        label: j['label'] as String?,
        state: agentStateFromWire(j['state'] as String?),
        canInject: (j['cmuxTarget'] != null) || (j['tmuxTarget'] != null),
      );
}

/// Command actions the App can send. Mirrors command-router.js.
enum SlotCommand { accept, reject, quick, focus }

String slotCommandToWire(SlotCommand c) {
  switch (c) {
    case SlotCommand.accept:
      return 'accept';
    case SlotCommand.reject:
      return 'reject';
    case SlotCommand.quick:
      return 'quick';
    case SlotCommand.focus:
      return 'focus';
  }
}

/// Connection lifecycle for the UI to reflect.
enum LiveConnection { connecting, connected, disconnected }
