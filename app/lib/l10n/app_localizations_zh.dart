// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Chinese (`zh`).
class AppLocalizationsZh extends AppLocalizations {
  AppLocalizationsZh([String locale = 'zh']) : super(locale);

  @override
  String get connectSubtitle => '连接你的 Host';

  @override
  String get pairUrlLabel => '配对链接（电脑 /pair 二维码里的地址）';

  @override
  String get tokenLabel => 'token（若链接里没带）';

  @override
  String get parseErrorText => '解析失败：粘贴配对链接（含 ?token=），或填 host:port + token';

  @override
  String get connectButton => '连接';

  @override
  String get scanButton => '扫码';

  @override
  String get connectFooterHint => '手机需与 Host 同一局域网。也可点\"扫码\"直接扫电脑 /pair 页面的二维码。';

  @override
  String get lcdConnecting => 'LIVE · 连接中…';

  @override
  String get lcdConnected => 'LIVE · 已连接';

  @override
  String get lcdNoData => '连上了但没数据 — 检查 Host 是否在跑 / token 是否对';

  @override
  String get lcdDisconnectedReconnecting => '断线，重连中…（灯保持）';

  @override
  String needsInputAlert(String name) {
    return '$name 需要你 — 选中再按 ◎✓/⊗';
  }

  @override
  String selectedAgent(String name) {
    return '已选中 $name（◎✓/⊗ 只作用于它）';
  }

  @override
  String get selectAgentFirstKey => '先点一盏 Agent 灯选中它，再按此键';

  @override
  String acceptSent(int slot) {
    return '◎✓ 接受 → agent $slot';
  }

  @override
  String rejectSent(int slot) {
    return '⊗ 拒绝 → agent $slot';
  }

  @override
  String quickSent(int slot) {
    return '⚡ 继续（回车）→ agent $slot';
  }

  @override
  String get newSessionHint => '💭 新会话请在电脑开 claude/codex，会自动上灯';

  @override
  String get branchHint => '⤴ 分叉是电脑端操作';

  @override
  String reasoningDisplay(String level) {
    return '思考力度显示 $level（远程只读）';
  }

  @override
  String get noActiveAgent => '暂无活跃 agent';

  @override
  String focusMoved(String name) {
    return '焦点 → $name';
  }

  @override
  String get scrollTop => '↟ 回到顶部';

  @override
  String get scrollLog => '↡ 滚动日志';

  @override
  String get selectAgentFirstPtt => '先点一盏 Agent 灯选中它，再按住说话';

  @override
  String get speechUnavailable => '语音识别不可用（模拟器或未授权），改用键盘';

  @override
  String get recording => '🎙 录音中…';

  @override
  String recordingLive(String words) {
    return '🎙 $words';
  }

  @override
  String get didntCatchThat => '没听清';

  @override
  String promptSent(String words) {
    return '🎙 已派活：$words';
  }

  @override
  String get touchHint => '触摸：嘀（长按切音色）';

  @override
  String keySoundSwitched(String profile) {
    return '音色 → $profile';
  }

  @override
  String get keySoundPom => 'POM 清脆轴';

  @override
  String get keySoundPok => 'POK 静音轴';

  @override
  String get scanTitle => '扫描配对二维码';

  @override
  String get scanHint => '对准电脑上 /pair 页面的二维码';

  @override
  String get bannerConnecting => '连接中…';

  @override
  String get bannerDisconnected => '连接断开，重连中…';

  @override
  String get emptyAgentsHint => '暂无活跃 agent — 在电脑上开 claude/codex 会自动上灯';
}
