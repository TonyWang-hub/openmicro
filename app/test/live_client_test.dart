import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:async/async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:openmicro/model/slot.dart';
import 'package:openmicro/net/live_client.dart';

/// Minimal fake Host: a plain [HttpServer] that upgrades every request to a
/// WebSocket, mirroring the toy Host's `ws://<host>:<port>/?token=<token>`
/// contract from docs/specs/2026-07-18-native-app.md.
class FakeHost {
  FakeHost(this._server) {
    _sub = _server.listen((request) async {
      final socket = await WebSocketTransformer.upgrade(request);
      _sockets.add(socket);
      socket.listen(
        (data) {
          if (data is String) {
            _incoming.add(data);
          }
        },
        onDone: () {
          _sockets.remove(socket);
        },
      );
    });
  }

  static Future<FakeHost> start() async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    return FakeHost(server);
  }

  final HttpServer _server;
  late final StreamSubscription<HttpRequest> _sub;
  final List<WebSocket> _sockets = [];
  final StreamController<String> _incoming = StreamController<String>.broadcast();

  int get port => _server.port;

  /// Messages sent by any connected client, as raw JSON strings.
  Stream<String> get incoming => _incoming.stream;

  Future<void> waitForConnection() async {
    final deadline = DateTime.now().add(const Duration(seconds: 5));
    while (_sockets.isEmpty) {
      if (DateTime.now().isAfter(deadline)) {
        throw StateError('Timed out waiting for a client connection');
      }
      await Future<void>.delayed(const Duration(milliseconds: 10));
    }
  }

  void broadcast(Map<String, dynamic> payload) {
    final raw = jsonEncode(payload);
    for (final socket in List<WebSocket>.from(_sockets)) {
      socket.add(raw);
    }
  }

  /// Closes all currently-connected client sockets (server-initiated
  /// disconnect), without shutting down the listening server.
  Future<void> disconnectAll() async {
    for (final socket in List<WebSocket>.from(_sockets)) {
      await socket.close();
    }
    _sockets.clear();
  }

  Future<void> close() async {
    await _sub.cancel();
    await _incoming.close();
    for (final socket in List<WebSocket>.from(_sockets)) {
      await socket.close();
    }
    await _server.close(force: true);
  }
}

void main() {
  late FakeHost host;
  LiveClient? client;

  setUp(() async {
    host = await FakeHost.start();
  });

  tearDown(() async {
    client?.dispose();
    client = null;
    await host.close();
  });

  test('sends subscribe immediately after connecting', () async {
    final incoming = StreamQueue<String>(host.incoming);

    client = LiveClient(host: '127.0.0.1', port: host.port, token: 't0k')
      ..connect();

    final first = await incoming.next.timeout(const Duration(seconds: 5));
    final decoded = jsonDecode(first) as Map<String, dynamic>;
    expect(decoded['type'], 'subscribe');

    await incoming.cancel();
  });

  test('parses a state push into List<SlotState> with derived canInject', () async {
    final connections = StreamQueue<LiveConnection>(
      (client = LiveClient(host: '127.0.0.1', port: host.port, token: 't0k'))
          .connection,
    );

    client!.connect();
    expect(
      await connections.next.timeout(const Duration(seconds: 5)),
      LiveConnection.connecting,
    );
    expect(
      await connections.next.timeout(const Duration(seconds: 5)),
      LiveConnection.connected,
    );

    await host.waitForConnection();

    final slotsQueue = StreamQueue<List<SlotState>>(client!.slots);

    host.broadcast({
      'type': 'state',
      'slots': [
        {
          'slotId': 0,
          'label': 'my-project',
          'state': 'thinking',
          'cmuxTarget': 'pane-1',
          'tmuxTarget': null,
        },
        {
          'slotId': 1,
          'label': null,
          'state': 'idle',
          'cmuxTarget': null,
          'tmuxTarget': null,
        },
      ],
    });

    final slots = await slotsQueue.next.timeout(const Duration(seconds: 5));
    expect(slots, hasLength(2));

    expect(slots[0].slotId, 0);
    expect(slots[0].label, 'my-project');
    expect(slots[0].state, AgentState.thinking);
    expect(slots[0].canInject, isTrue);

    expect(slots[1].slotId, 1);
    expect(slots[1].label, isNull);
    expect(slots[1].state, AgentState.idle);
    expect(slots[1].canInject, isFalse);

    await slotsQueue.cancel();
    await connections.cancel();
  });

  test('sendCommand emits the expected wire payload', () async {
    final incoming = StreamQueue<String>(host.incoming);

    client = LiveClient(host: '127.0.0.1', port: host.port, token: 't0k')
      ..connect();

    // First message is always the initial subscribe.
    await incoming.next.timeout(const Duration(seconds: 5));

    client!.sendCommand(SlotCommand.accept, 3);

    final raw = await incoming.next.timeout(const Duration(seconds: 5));
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    expect(decoded['type'], 'command');
    expect(decoded['payload'], {'action': 'accept', 'slotId': 3});

    await incoming.cancel();
  });

  test('sendCommand before connection is established is a silent no-op', () async {
    client = LiveClient(host: '127.0.0.1', port: host.port, token: 't0k');
    // connect() not called yet — client has never opened a socket.
    expect(() => client!.sendCommand(SlotCommand.reject, 5), returnsNormally);
  });

  test('emits disconnected when the server drops the connection', () async {
    final connections = StreamQueue<LiveConnection>(
      (client = LiveClient(host: '127.0.0.1', port: host.port, token: 't0k'))
          .connection,
    );

    client!.connect();
    expect(
      await connections.next.timeout(const Duration(seconds: 5)),
      LiveConnection.connecting,
    );
    expect(
      await connections.next.timeout(const Duration(seconds: 5)),
      LiveConnection.connected,
    );

    await host.waitForConnection();
    await host.disconnectAll();

    expect(
      await connections.next.timeout(const Duration(seconds: 5)),
      LiveConnection.disconnected,
    );

    await connections.cancel();
  });
}
