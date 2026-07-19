import 'dart:convert';

import 'package:async/async.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:microtoy/net/live_client.dart';

// Reuses the FakeHost fake Host from live_client_test.dart (plain HttpServer
// upgraded to WebSocket, mirroring the toy Host's `ws://<host>:<port>/?token=`
// contract) instead of duplicating it. Only adds coverage for `sendPrompt`,
// which the existing file doesn't exercise.
import 'live_client_test.dart' show FakeHost;

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

  test('sendPrompt emits {type:command, payload:{action:prompt,slotId,text}}', () async {
    final incoming = StreamQueue<String>(host.incoming);

    client = LiveClient(host: '127.0.0.1', port: host.port, token: 't0k')
      ..connect();

    // First message is always the initial subscribe; skip it.
    await incoming.next.timeout(const Duration(seconds: 5));

    client!.sendPrompt(2, 'hello world');

    final raw = await incoming.next.timeout(const Duration(seconds: 5));
    final decoded = jsonDecode(raw) as Map<String, dynamic>;
    expect(decoded['type'], 'command');
    expect(decoded['payload'], {'action': 'prompt', 'slotId': 2, 'text': 'hello world'});

    await incoming.cancel();
  });

  test('sendPrompt before connection is established is a silent no-op', () async {
    client = LiveClient(host: '127.0.0.1', port: host.port, token: 't0k');
    // connect() not called yet — client has never opened a socket.
    expect(() => client!.sendPrompt(1, 'ignored'), returnsNormally);
  });
}
