import 'dart:async';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'model/slot.dart';
import 'keyboard/device.dart';
import 'net/live_client.dart';
import 'haptics/haptics.dart';
import 'audio/keysound.dart';
import 'pair/scan_page.dart';
import 'widgets/connection_banner.dart';
import 'widgets/empty_agents_hint.dart';

// M2/M3: connect screen (paste pairing URL) → live keyboard wired to the Host
// WS, with haptics + key sounds on interaction and the explicit-focus safety
// guard (commands only ever hit the selected slot).
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Haptics.instance.init();
  await KeySound().init();
  runApp(const MicroToyApp());
}

class MicroToyApp extends StatelessWidget {
  const MicroToyApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MicroToy',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(useMaterial3: true, brightness: Brightness.light),
      home: const ConnectScreen(),
    );
  }
}

/// Parsed connection target from a pairing URL / string.
class Target {
  final String host;
  final int port;
  final String token;
  const Target(this.host, this.port, this.token);
}

/// Accepts a full pairing URL (`http://192.168.31.248:7788/m?token=toy2026&live=1`)
/// or a bare `host:port` + separate token. Returns null if unparseable.
Target? parseTarget(String raw, {String? tokenField}) {
  raw = raw.trim();
  if (raw.isEmpty) return null;
  try {
    if (raw.startsWith('http')) {
      final u = Uri.parse(raw);
      final tok = u.queryParameters['token'] ?? tokenField ?? '';
      if (tok.isEmpty) return null;
      return Target(u.host, u.hasPort ? u.port : 7788, tok);
    }
    // host:port form
    final parts = raw.split(':');
    final host = parts[0];
    final port = parts.length > 1 ? int.tryParse(parts[1]) ?? 7788 : 7788;
    final tok = (tokenField ?? '').trim();
    if (host.isEmpty || tok.isEmpty) return null;
    return Target(host, port, tok);
  } catch (_) {
    return null;
  }
}

class ConnectScreen extends StatefulWidget {
  const ConnectScreen({super.key});
  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final _urlCtrl = TextEditingController();
  final _tokenCtrl = TextEditingController();
  String? _error;

  @override
  void initState() {
    super.initState();
    // Test/dev shortcut: `--dart-define=PAIR_URL=...` auto-connects on launch
    // (handy on a simulator where typing the pairing URL is painful).
    const injected = String.fromEnvironment('PAIR_URL');
    if (injected.isNotEmpty) {
      final t = parseTarget(injected);
      if (t != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => KeyboardScreen(target: t)),
            );
          }
        });
      }
    }
    SharedPreferences.getInstance().then((p) {
      _urlCtrl.text = p.getString('pair_url') ?? injected;
      _tokenCtrl.text = p.getString('pair_token') ?? '';
      if (mounted) setState(() {});
    });
  }

  Future<void> _connect() async {
    final t = parseTarget(_urlCtrl.text, tokenField: _tokenCtrl.text);
    if (t == null) {
      setState(() => _error = '解析失败：粘贴配对链接（含 ?token=），或填 host:port + token');
      return;
    }
    final p = await SharedPreferences.getInstance();
    await p.setString('pair_url', _urlCtrl.text.trim());
    await p.setString('pair_token', t.token);
    if (!mounted) return;
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => KeyboardScreen(target: t)));
  }

  Future<void> _scan() async {
    final scanned = await Navigator.of(
      context,
    ).push<String>(MaterialPageRoute(builder: (_) => const ScanPage()));
    if (scanned == null || scanned.isEmpty || !mounted) return;
    setState(() {
      _urlCtrl.text = scanned;
      _error = null;
    });
    await _connect();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFEDEEF2),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  'MicroToy',
                  style: TextStyle(fontSize: 28, fontWeight: FontWeight.w700),
                ),
                const SizedBox(height: 4),
                const Text(
                  '连接你的 Host',
                  style: TextStyle(color: Colors.black54),
                ),
                const SizedBox(height: 24),
                TextField(
                  controller: _urlCtrl,
                  decoration: const InputDecoration(
                    labelText: '配对链接（电脑 /pair 二维码里的地址）',
                    hintText: 'http://192.168.31.248:7788/m?token=…&live=1',
                    border: OutlineInputBorder(),
                  ),
                  minLines: 1,
                  maxLines: 3,
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _tokenCtrl,
                  decoration: const InputDecoration(
                    labelText: 'token（若链接里没带）',
                    border: OutlineInputBorder(),
                  ),
                ),
                if (_error != null) ...[
                  const SizedBox(height: 10),
                  Text(
                    _error!,
                    style: const TextStyle(color: Colors.red, fontSize: 13),
                  ),
                ],
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: _connect,
                    child: const Text('连接'),
                  ),
                ),
                const SizedBox(height: 10),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _scan,
                    icon: const Icon(Icons.qr_code_scanner),
                    label: const Text('扫码'),
                  ),
                ),
                const SizedBox(height: 12),
                const Text(
                  '手机需与 Host 同一局域网。也可点"扫码"直接扫电脑 /pair 页面的二维码。',
                  style: TextStyle(color: Colors.black38, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class KeyboardScreen extends StatefulWidget {
  final Target target;
  const KeyboardScreen({super.key, required this.target});
  @override
  State<KeyboardScreen> createState() => _KeyboardScreenState();
}

class _KeyboardScreenState extends State<KeyboardScreen> {
  static const _noDataTimeout = Duration(seconds: 8);

  late final LiveClient _client;
  final _ks = KeySound();
  final _speech = SpeechToText();
  bool _speechAvailable = false;
  String _lastWords = '';
  List<SlotState> _slots = const [];
  int? _focused;
  String _reasoning = 'MED';
  String _lcd = 'LIVE · 连接中…';
  LiveConnection _conn = LiveConnection.connecting;

  // Detects a socket that connects fine but never actually streams a
  // `state` frame (e.g. Host not running / bad token past the handshake) —
  // otherwise the LCD would just sit on "已连接" forever with no feedback.
  Timer? _noDataTimer;
  bool _gotFirstState = false;

  @override
  void initState() {
    super.initState();
    _initSpeech();
    _client = LiveClient(
      host: widget.target.host,
      port: widget.target.port,
      token: widget.target.token,
    );
    _client.slots.listen((s) {
      _gotFirstState = true;
      _noDataTimer?.cancel();
      final hadNeeds = _slots.any((x) => x.state == AgentState.needsInput);
      setState(() => _slots = s);
      final nowNeeds = s.any((x) => x.state == AgentState.needsInput);
      if (nowNeeds && !hadNeeds) {
        Haptics.instance.alert();
        final w = s.firstWhere((x) => x.state == AgentState.needsInput);
        setState(
          () => _lcd = '${w.label ?? 'agent ${w.slotId}'} 需要你 — 选中再按 ◎✓/⊗',
        );
      }
    });
    _client.logs.listen((m) => setState(() => _lcd = m));
    _client.connection.listen(
      (c) => setState(() {
        _conn = c;
        if (c == LiveConnection.connected) {
          _lcd = 'LIVE · 已连接';
          _gotFirstState = false;
          _noDataTimer?.cancel();
          _noDataTimer = Timer(_noDataTimeout, () {
            if (!mounted || _gotFirstState) return;
            setState(() => _lcd = '连上了但没数据 — 检查 Host 是否在跑 / token 是否对');
          });
        }
        if (c == LiveConnection.disconnected) {
          _lcd = '断线，重连中…（灯保持）';
          _noDataTimer?.cancel();
        }
      }),
    );
    _client.connect();
  }

  Future<void> _initSpeech() async {
    try {
      final ok = await _speech.initialize(onError: (_) {}, onStatus: (_) {});
      if (mounted) setState(() => _speechAvailable = ok);
    } catch (_) {
      if (mounted) setState(() => _speechAvailable = false);
    }
  }

  @override
  void dispose() {
    _noDataTimer?.cancel();
    _client.dispose();
    if (_speech.isListening) _speech.stop();
    super.dispose();
  }

  SlotState? _slot(int id) {
    for (final s in _slots) {
      if (s.slotId == id) return s;
    }
    return null;
  }

  void _flash(String t) => setState(() => _lcd = t);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFEDEEF2),
      body: SafeArea(
        child: Column(
          children: [
            ConnectionBanner(connection: _conn),
            if (_slots.isEmpty) const EmptyAgentsHint(),
            Expanded(
              child: DeviceKeyboard(
                slots: _slots,
                focusedSlot: _focused,
                reasoning: _reasoning,
                lcd: _lcd,
                connection: _conn,
                onAgentTap: (id) {
                  _ks.keyUp('agent');
                  Haptics.instance.tap();
                  setState(() => _focused = id);
                  final label = _slot(id)?.label ?? 'agent $id';
                  _flash('已选中 $label（◎✓/⊗ 只作用于它）');
                  _client.sendCommand(SlotCommand.focus, id);
                },
                onCmd: (a) {
                  _ks.keyUp('cmd');
                  Haptics.instance.press();
                  // 显式聚焦守卫：命令键只作用于选中的 slot，未选中不发（防误注入）
                  if ((a == 'accept' || a == 'reject' || a == 'quick') &&
                      _focused == null) {
                    Haptics.instance.alert();
                    _flash('先点一盏 Agent 灯选中它，再按此键');
                    return;
                  }
                  if (a == 'accept') {
                    _client.sendCommand(SlotCommand.accept, _focused!);
                    Haptics.instance.success();
                    _flash('◎✓ 接受 → agent $_focused');
                  } else if (a == 'reject') {
                    _client.sendCommand(SlotCommand.reject, _focused!);
                    _flash('⊗ 拒绝 → agent $_focused');
                  } else if (a == 'quick') {
                    _client.sendCommand(SlotCommand.quick, _focused!);
                    _flash('⚡ 继续（回车）→ agent $_focused');
                  } else if (a == 'new_session') {
                    _flash('💭 新会话请在电脑开 claude/codex，会自动上灯');
                  } else if (a == 'branch') {
                    _flash('⤴ 分叉是电脑端操作');
                  }
                },
                onKnob: () {
                  _ks.knobTick();
                  Haptics.instance.detent();
                  setState(() {
                    const levels = ['LOW', 'MED', 'HIGH', 'XHIGH'];
                    _reasoning =
                        levels[(levels.indexOf(_reasoning) + 1) %
                            levels.length];
                    _lcd = '思考力度显示 $_reasoning（远程只读）';
                  });
                },
                onJoy: (dir) {
                  _ks.keyUp('cmd');
                  Haptics.instance.tap();
                  if (dir == 'left' || dir == 'right') {
                    final active =
                        (_slots.map((s) => s.slotId).toList()..sort());
                    if (active.isEmpty) {
                      _flash('暂无活跃 agent');
                      return;
                    }
                    final cur =
                        _focused == null ? -1 : active.indexOf(_focused!);
                    final next =
                        active[(cur +
                                (dir == 'right' ? 1 : active.length - 1) +
                                active.length) %
                            active.length];
                    setState(() => _focused = next);
                    final label = _slot(next)?.label ?? 'agent $next';
                    _flash('焦点 → $label');
                    _client.sendCommand(SlotCommand.focus, next);
                  } else {
                    _flash(dir == 'up' ? '↟ 回到顶部' : '↡ 滚动日志');
                  }
                },
                onPttStart: () {
                  _ks.pttStart();
                  if (_focused == null) {
                    Haptics.instance.alert();
                    _flash('先点一盏 Agent 灯选中它，再按住说话');
                    return;
                  }
                  if (!_speechAvailable) {
                    Haptics.instance.alert();
                    _flash('语音识别不可用（模拟器或未授权），改用键盘');
                    return;
                  }
                  _lastWords = '';
                  Haptics.instance.alert();
                  _flash('🎙 录音中…');
                  _speech.listen(
                    onResult: (r) {
                      _lastWords = r.recognizedWords;
                      _flash('🎙 ${r.recognizedWords}');
                    },
                    listenOptions: SpeechListenOptions(localeId: 'zh_CN'),
                  );
                },
                onPttEnd: () {
                  _ks.pttStop();
                  Haptics.instance.press();
                  if (_focused == null || !_speechAvailable) return;
                  _speech.stop();
                  final words = _lastWords.trim();
                  if (words.isEmpty) {
                    _flash('没听清');
                    return;
                  }
                  _client.sendPrompt(_focused!, words);
                  Haptics.instance.success();
                  _flash('🎙 已派活：$words');
                },
                onTouch: () {
                  _ks.keyUp('touch');
                  Haptics.instance.tap();
                  _flash('触摸：嘀（长按切音色）');
                },
                onTouchLong: () async {
                  final next = _ks.profile == 'pom' ? 'pok' : 'pom';
                  await _ks.setProfile(next);
                  Haptics.instance.success();
                  _flash('音色 → ${next == 'pom' ? 'POM 清脆轴' : 'POK 静音轴'}');
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
