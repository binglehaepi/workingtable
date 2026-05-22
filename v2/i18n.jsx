/* global React */
// ===========================================================
// 다국어 (i18n) — ko / en / zh / ja
// 첫 실행 시 OS/브라우저 언어 자동 감지. 설정에서 변경 가능.
// L("key", {var}) 로 번역 문자열 사용. App이 useI18n()로 구독해 전역 리렌더.
// ===========================================================
(function () {
  const DICT = {
    ko: {
      "tab.todo": "할 일", "tab.cheat": "명령어", "tab.mail": "문의", "tab.cal": "달력", "tab.photo": "포토카드", "tab.deco": "꾸미기", "tab.settings": "설정",
      "proj.menu": "프로젝트", "proj.new": "＋ 새 프로젝트 추가", "proj.rename": "✎ 이름 변경", "proj.delete": "✕ \"{name}\" 삭제",
      "proj.newPrompt": "새 프로젝트 이름", "proj.renamePrompt": "프로젝트 이름 변경", "proj.fallback": "프로젝트",
      "proj.deleteConfirm": "\"{name}\" 프로젝트를 삭제할까요? (할 일 등 데이터는 그대로 남음)",
      "todo.need": "해야 할 일", "todo.done": "한 일", "todo.add": "할 일 추가…",
      "todo.emptyNeed": "아래 입력칸에 할 일을 적어주세요", "todo.emptyDone": "끝낸 일이 여기에 쌓여요",
      "cheat.registered": "등록한 명령어", "cheat.frequent": "주로 쓰는 명령어", "cheat.add": "명령어 추가…",
      "cheat.emptyReg": "위 입력칸에 명령어를 적어 저장하세요", "cheat.emptyFreq": "자주 쓰면 여기에 올라와요 (복사 시 카운트)",
      "cheat.label": "(라벨)", "cheat.uses": "{n}회", "cheat.delConfirm": "\"{x}\" 을(를) 삭제할까요?",
      "mail.received": "받은 문의", "mail.draft": "메일 초안", "mail.paste": "받은 메일 붙여넣기…", "mail.add": "담기",
      "mail.markReplied": "답장함으로 표시", "mail.replied": "✓ 답장함", "mail.site": "사이트 열기", "mail.siteConnect": "사이트 연결",
      "mail.draftLabel": "답장 초안", "mail.emptyTop": "받은 메일을 붙여넣어 담아보세요",
      "mail.emptyBottom": "위에서 받은 문의를 선택하면 여기서 초안을 적을 수 있어요",
      "mail.draftPlaceholder": "답장 초안을 적어두세요…", "mail.noTitle": "(제목 없음)", "mail.inquiry": "받은 문의",
      "mail.sitePrompt": "이 메일의 답장/플랫폼 주소 (예: https://mail.google.com/...)",
      "cal.todayBtn": "오늘로", "cal.note": "오늘의 메모 · 일기를 적어보세요…",
      "cal.done": "{n}개 완료", "cal.mails": "{n}개 메일",
      "dday.set": "설정", "dday.dday": "D-DAY", "dday.title": "디데이 설정", "dday.label": "디데이",
      "dday.namePlaceholder": "이름 (예: 출시)", "dday.clear": "날짜 지우기",
      "music.add": "유튜브 링크를 추가하세요 ♫", "music.loading": "재생 준비 중…",
      "music.playlist": "플레이리스트 ♫", "music.paste": "유튜브 링크 붙여넣기", "music.err": "유튜브 링크를 인식하지 못했어요", "music.empty": "유튜브 링크를 붙여넣어 곡을 추가하세요",
      "timer.next": "다음 스트레칭", "work.title": "오늘 작업한 시간",
      "set.dock": "도크 위치", "set.left": "왼쪽", "set.right": "오른쪽",
      "set.tabDir": "인덱스 탭 방향", "set.outer": "바깥쪽", "set.inner": "안쪽",
      "set.desktop": "데스크탑 모드 (투명 창)", "set.on": "켜짐", "set.off": "꺼짐",
      "set.lang": "언어 (Language)", "set.size": "앱 길이", "set.sizeNormal": "기본", "set.sizeMedium": "중간", "set.sizeCompact": "짧게", "set.data": "데이터", "set.reset": "모든 데이터 초기화",
      "set.resetCaption": "프로젝트·할 일·명령어·문의·메모가 모두 지워지고 초기 상태로 돌아갑니다.",
      "set.resetConfirm": "정말 모든 데이터를 지우고 초기 시드로 되돌릴까요?",
      "deco.theme": "테마", "deco.bg": "배경", "deco.color": "색상",
      "deco.baseTheme": "기본 테마", "deco.myTheme": "내 테마", "deco.save": "＋ 지금 화면을 내 테마로 저장",
      "deco.saveName": "테마 이름", "deco.myThemeName": "내 테마 ",
      "deco.preview": "미리보기", "deco.type": "종류", "deco.linear": "선형", "deco.radial": "원형(오로라)",
      "deco.dir": "방향", "deco.stops": "색 단계", "deco.addColor": "＋ 색 추가",
      "deco.shape": "도형", "deco.shapeNone": "없음", "deco.shapeHeart": "하트", "deco.shapeHearts": "겹하트", "deco.shapeStars": "별", "deco.shapeClover": "클로버", "deco.shapeRibbon": "리본", "deco.shapeFish": "금붕어",
      "deco.point": "포인트 컬러", "deco.chrome": "헤더·바 색 (타이틀바 / 탭)", "deco.headerGrad": "헤더 그라데이션",
      "th.basic": "기본", "th.melon": "메론소다", "th.summer": "여름", "th.green": "초록", "th.milk": "딸기우유", "th.peach": "복숭아", "th.lavender": "라벤더", "th.night": "밤하늘",
    },
    en: {
      "tab.todo": "Tasks", "tab.cheat": "Commands", "tab.mail": "Inbox", "tab.cal": "Calendar", "tab.photo": "Photocard", "tab.deco": "Theme", "tab.settings": "Settings",
      "proj.menu": "Project", "proj.new": "＋ New project", "proj.rename": "✎ Rename", "proj.delete": "✕ Delete \"{name}\"",
      "proj.newPrompt": "New project name", "proj.renamePrompt": "Rename project", "proj.fallback": "Project",
      "proj.deleteConfirm": "Delete project \"{name}\"? (tasks and other data remain)",
      "todo.need": "To do", "todo.done": "Done", "todo.add": "Add a task…",
      "todo.emptyNeed": "Type a task in the box below", "todo.emptyDone": "Finished tasks pile up here",
      "cheat.registered": "Saved commands", "cheat.frequent": "Frequently used", "cheat.add": "Add a command…",
      "cheat.emptyReg": "Type a command above to save it", "cheat.emptyFreq": "Used ones show up here (counted on copy)",
      "cheat.label": "(label)", "cheat.uses": "{n}×", "cheat.delConfirm": "Delete \"{x}\"?",
      "mail.received": "Received", "mail.draft": "Draft", "mail.paste": "Paste received mail…", "mail.add": "Add",
      "mail.markReplied": "Mark replied", "mail.replied": "✓ Replied", "mail.site": "Open site", "mail.siteConnect": "Link site",
      "mail.draftLabel": "Reply draft", "mail.emptyTop": "Paste a received mail to add it",
      "mail.emptyBottom": "Select a received inquiry above to write a draft here",
      "mail.draftPlaceholder": "Write your reply draft…", "mail.noTitle": "(no subject)", "mail.inquiry": "Inquiry",
      "mail.sitePrompt": "Reply/platform URL for this mail (e.g. https://mail.google.com/...)",
      "cal.todayBtn": "Today", "cal.note": "Write today's memo · diary…",
      "cal.done": "{n} done", "cal.mails": "{n} mails",
      "dday.set": "set", "dday.dday": "D-DAY", "dday.title": "D-day settings", "dday.label": "D-day",
      "dday.namePlaceholder": "Name (e.g. Launch)", "dday.clear": "Clear date",
      "music.add": "Add a YouTube link ♫", "music.loading": "Loading…",
      "music.playlist": "Playlist ♫", "music.paste": "Paste YouTube link", "music.err": "Couldn't read that YouTube link", "music.empty": "Paste a YouTube link to add a track",
      "timer.next": "Next stretch", "work.title": "Worked today",
      "set.dock": "Dock side", "set.left": "Left", "set.right": "Right",
      "set.tabDir": "Tab direction", "set.outer": "Outward", "set.inner": "Inward",
      "set.desktop": "Desktop mode (transparent)", "set.on": "On", "set.off": "Off",
      "set.lang": "Language", "set.size": "App height", "set.sizeNormal": "Large", "set.sizeMedium": "Medium", "set.sizeCompact": "Short", "set.data": "Data", "set.reset": "Reset all data",
      "set.resetCaption": "All projects, tasks, commands, inbox and memos are erased and reset.",
      "set.resetConfirm": "Erase all data and reset to the initial state?",
      "deco.theme": "Themes", "deco.bg": "Background", "deco.color": "Colors",
      "deco.baseTheme": "Presets", "deco.myTheme": "My themes", "deco.save": "＋ Save current as my theme",
      "deco.saveName": "Theme name", "deco.myThemeName": "My theme ",
      "deco.preview": "Preview", "deco.type": "Type", "deco.linear": "Linear", "deco.radial": "Radial (aura)",
      "deco.dir": "Direction", "deco.stops": "Color stops", "deco.addColor": "＋ Add color",
      "deco.shape": "Shape", "deco.shapeNone": "None", "deco.shapeHeart": "Heart", "deco.shapeHearts": "Hearts", "deco.shapeStars": "Stars", "deco.shapeClover": "Clover", "deco.shapeRibbon": "Ribbon", "deco.shapeFish": "Goldfish",
      "deco.point": "Accent color", "deco.chrome": "Header / bar color", "deco.headerGrad": "Header gradient",
      "th.basic": "Basic", "th.melon": "Melon Soda", "th.summer": "Summer", "th.green": "Green", "th.milk": "Strawberry Milk", "th.peach": "Peach", "th.lavender": "Lavender", "th.night": "Night Sky",
    },
    zh: {
      "tab.todo": "待办", "tab.cheat": "命令", "tab.mail": "收件", "tab.cal": "日历", "tab.photo": "拍立得", "tab.deco": "装扮", "tab.settings": "设置",
      "proj.menu": "项目", "proj.new": "＋ 新建项目", "proj.rename": "✎ 重命名", "proj.delete": "✕ 删除 \"{name}\"",
      "proj.newPrompt": "新项目名称", "proj.renamePrompt": "重命名项目", "proj.fallback": "项目",
      "proj.deleteConfirm": "删除项目 \"{name}\"？（任务等数据将保留）",
      "todo.need": "待办", "todo.done": "已完成", "todo.add": "添加任务…",
      "todo.emptyNeed": "在下方输入框写下任务", "todo.emptyDone": "完成的任务会累积在这里",
      "cheat.registered": "已保存命令", "cheat.frequent": "常用命令", "cheat.add": "添加命令…",
      "cheat.emptyReg": "在上方输入命令以保存", "cheat.emptyFreq": "常用的会显示在这里（复制时计数）",
      "cheat.label": "(标签)", "cheat.uses": "{n}次", "cheat.delConfirm": "删除 \"{x}\"？",
      "mail.received": "收到的咨询", "mail.draft": "回复草稿", "mail.paste": "粘贴收到的邮件…", "mail.add": "添加",
      "mail.markReplied": "标记为已回复", "mail.replied": "✓ 已回复", "mail.site": "打开网站", "mail.siteConnect": "关联网站",
      "mail.draftLabel": "回复草稿", "mail.emptyTop": "粘贴收到的邮件以添加",
      "mail.emptyBottom": "在上方选择咨询后即可在此撰写草稿",
      "mail.draftPlaceholder": "写下回复草稿…", "mail.noTitle": "(无主题)", "mail.inquiry": "咨询",
      "mail.sitePrompt": "此邮件的回复/平台网址（例：https://mail.google.com/...）",
      "cal.todayBtn": "今天", "cal.note": "写下今天的备忘 · 日记…",
      "cal.done": "完成{n}项", "cal.mails": "{n}封邮件",
      "dday.set": "设置", "dday.dday": "倒数日", "dday.title": "倒数日设置", "dday.label": "倒数日",
      "dday.namePlaceholder": "名称（例：发布）", "dday.clear": "清除日期",
      "music.add": "添加 YouTube 链接 ♫", "music.loading": "加载中…",
      "music.playlist": "播放列表 ♫", "music.paste": "粘贴 YouTube 链接", "music.err": "无法识别该 YouTube 链接", "music.empty": "粘贴 YouTube 链接以添加曲目",
      "timer.next": "下次伸展", "work.title": "今日工作时长",
      "set.dock": "停靠位置", "set.left": "左侧", "set.right": "右侧",
      "set.tabDir": "标签方向", "set.outer": "向外", "set.inner": "向内",
      "set.desktop": "桌面模式（透明）", "set.on": "开", "set.off": "关",
      "set.lang": "语言", "set.size": "应用高度", "set.sizeNormal": "大", "set.sizeMedium": "中", "set.sizeCompact": "紧凑", "set.data": "数据", "set.reset": "重置所有数据",
      "set.resetCaption": "所有项目、任务、命令、收件和备忘都会被清除并重置。",
      "set.resetConfirm": "确定清除所有数据并恢复初始状态吗？",
      "deco.theme": "主题", "deco.bg": "背景", "deco.color": "颜色",
      "deco.baseTheme": "预设主题", "deco.myTheme": "我的主题", "deco.save": "＋ 保存当前为我的主题",
      "deco.saveName": "主题名称", "deco.myThemeName": "我的主题 ",
      "deco.preview": "预览", "deco.type": "类型", "deco.linear": "线性", "deco.radial": "径向(光晕)",
      "deco.dir": "方向", "deco.stops": "颜色节点", "deco.addColor": "＋ 添加颜色",
      "deco.shape": "图形", "deco.shapeNone": "无", "deco.shapeHeart": "爱心", "deco.shapeHearts": "多层爱心", "deco.shapeStars": "星星", "deco.shapeClover": "四叶草", "deco.shapeRibbon": "蝴蝶结", "deco.shapeFish": "金鱼",
      "deco.point": "强调色", "deco.chrome": "标题栏 / 标签色", "deco.headerGrad": "标题渐变",
      "th.basic": "基础", "th.melon": "蜜瓜苏打", "th.summer": "夏天", "th.green": "绿色", "th.milk": "草莓牛奶", "th.peach": "蜜桃", "th.lavender": "薰衣草", "th.night": "夜空",
    },
    ja: {
      "tab.todo": "タスク", "tab.cheat": "コマンド", "tab.mail": "問い合わせ", "tab.cal": "カレンダー", "tab.photo": "フォトカード", "tab.deco": "着せ替え", "tab.settings": "設定",
      "proj.menu": "プロジェクト", "proj.new": "＋ 新規プロジェクト", "proj.rename": "✎ 名前変更", "proj.delete": "✕ \"{name}\" を削除",
      "proj.newPrompt": "新しいプロジェクト名", "proj.renamePrompt": "プロジェクト名を変更", "proj.fallback": "プロジェクト",
      "proj.deleteConfirm": "プロジェクト \"{name}\" を削除しますか？（タスク等のデータは残ります）",
      "todo.need": "やること", "todo.done": "やったこと", "todo.add": "タスクを追加…",
      "todo.emptyNeed": "下の入力欄にタスクを書いてください", "todo.emptyDone": "終えたタスクがここに溜まります",
      "cheat.registered": "保存したコマンド", "cheat.frequent": "よく使うコマンド", "cheat.add": "コマンドを追加…",
      "cheat.emptyReg": "上の入力欄にコマンドを書いて保存", "cheat.emptyFreq": "よく使うとここに上がります（コピーで集計）",
      "cheat.label": "(ラベル)", "cheat.uses": "{n}回", "cheat.delConfirm": "\"{x}\" を削除しますか？",
      "mail.received": "受信した問い合わせ", "mail.draft": "返信下書き", "mail.paste": "受信メールを貼り付け…", "mail.add": "追加",
      "mail.markReplied": "返信済みにする", "mail.replied": "✓ 返信済み", "mail.site": "サイトを開く", "mail.siteConnect": "サイトを連携",
      "mail.draftLabel": "返信下書き", "mail.emptyTop": "受信メールを貼り付けて追加",
      "mail.emptyBottom": "上で問い合わせを選ぶとここで下書きを書けます",
      "mail.draftPlaceholder": "返信の下書きを書いてください…", "mail.noTitle": "(件名なし)", "mail.inquiry": "問い合わせ",
      "mail.sitePrompt": "このメールの返信/プラットフォームURL（例：https://mail.google.com/...）",
      "cal.todayBtn": "今日へ", "cal.note": "今日のメモ・日記を書いてみよう…",
      "cal.done": "{n}件完了", "cal.mails": "{n}件メール",
      "dday.set": "設定", "dday.dday": "D-DAY", "dday.title": "Dデー設定", "dday.label": "Dデー",
      "dday.namePlaceholder": "名前（例：リリース）", "dday.clear": "日付を消す",
      "music.add": "YouTubeリンクを追加 ♫", "music.loading": "読み込み中…",
      "music.playlist": "プレイリスト ♫", "music.paste": "YouTubeリンクを貼り付け", "music.err": "YouTubeリンクを認識できませんでした", "music.empty": "YouTubeリンクを貼り付けて曲を追加",
      "timer.next": "次のストレッチ", "work.title": "今日の作業時間",
      "set.dock": "ドック位置", "set.left": "左", "set.right": "右",
      "set.tabDir": "タブ方向", "set.outer": "外側", "set.inner": "内側",
      "set.desktop": "デスクトップモード（透明）", "set.on": "オン", "set.off": "オフ",
      "set.lang": "言語", "set.size": "アプリの高さ", "set.sizeNormal": "大", "set.sizeMedium": "中", "set.sizeCompact": "コンパクト", "set.data": "データ", "set.reset": "すべてのデータを初期化",
      "set.resetCaption": "プロジェクト・タスク・コマンド・問い合わせ・メモがすべて消去され初期化されます。",
      "set.resetConfirm": "本当にすべてのデータを消して初期状態に戻しますか？",
      "deco.theme": "テーマ", "deco.bg": "背景", "deco.color": "カラー",
      "deco.baseTheme": "プリセット", "deco.myTheme": "マイテーマ", "deco.save": "＋ 今の画面をマイテーマに保存",
      "deco.saveName": "テーマ名", "deco.myThemeName": "マイテーマ ",
      "deco.preview": "プレビュー", "deco.type": "種類", "deco.linear": "線形", "deco.radial": "放射(オーロラ)",
      "deco.dir": "方向", "deco.stops": "カラーストップ", "deco.addColor": "＋ 色を追加",
      "deco.shape": "図形", "deco.shapeNone": "なし", "deco.shapeHeart": "ハート", "deco.shapeHearts": "重ねハート", "deco.shapeStars": "星", "deco.shapeClover": "クローバー", "deco.shapeRibbon": "リボン", "deco.shapeFish": "金魚",
      "deco.point": "アクセント色", "deco.chrome": "ヘッダー / バー色", "deco.headerGrad": "ヘッダーグラデーション",
      "th.basic": "ベーシック", "th.melon": "メロンソーダ", "th.summer": "夏", "th.green": "グリーン", "th.milk": "いちごミルク", "th.peach": "ピーチ", "th.lavender": "ラベンダー", "th.night": "夜空",
    },
  };

  const WEEK = {
    ko: ["일", "월", "화", "수", "목", "금", "토"],
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    zh: ["日", "一", "二", "三", "四", "五", "六"],
    ja: ["日", "月", "火", "水", "木", "金", "土"],
  };
  const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const KEY = "vibe-diary.lang";
  function detect() {
    const l = (navigator.language || navigator.userLanguage || "en").toLowerCase();
    if (l.startsWith("ko")) return "ko";
    if (l.startsWith("zh")) return "zh";
    if (l.startsWith("ja")) return "ja";
    if (l.startsWith("en")) return "en";
    return "en";
  }
  let lang = localStorage.getItem(KEY) || detect();
  const subs = new Set();

  window.i18n = {
    get() { return lang; },
    set(l) { if (!DICT[l]) return; lang = l; try { localStorage.setItem(KEY, l); } catch (_) {} subs.forEach(fn => fn()); },
    list() { return [["ko", "한국어"], ["en", "English"], ["zh", "中文"], ["ja", "日本語"]]; },
    t(key, vars) {
      const d = DICT[lang] || DICT.en;
      let s = d[key] ?? DICT.en[key] ?? DICT.ko[key] ?? key;
      if (vars) for (const k in vars) s = s.split("{" + k + "}").join(vars[k]);
      return s;
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    weekdays() { return WEEK[lang] || WEEK.en; },
    fmtDate(iso) {
      if (!iso) return "";
      const [y, m, d] = iso.split("-").map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      const dn = (WEEK[lang] || WEEK.en)[dow];
      if (lang === "ko") return `${m}월 ${d}일 (${dn})`;
      if (lang === "ja") return `${m}月${d}日 (${dn})`;
      if (lang === "zh") return `${m}月${d}日 (周${dn})`;
      return `${MON_EN[m - 1]} ${d} (${dn})`;
    },
  };
})();

function useI18n() {
  const [, f] = React.useState(0);
  React.useEffect(() => window.i18n.subscribe(() => f(x => x + 1)), []);
  return window.i18n;
}
function L(key, vars) { return window.i18n.t(key, vars); }

window.useI18n = useI18n;
window.L = L;
