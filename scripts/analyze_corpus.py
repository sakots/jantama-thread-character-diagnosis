"""Sikiログの集計。本文サンプルはGit管理外のcorpus内だけに保存する。"""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from hashlib import sha256
from html.parser import HTMLParser
import json
from pathlib import Path
import re

DICTIONARY = {
  '一姫・かずき': ['一姫', 'かずき', 'カズキ'],
  '福丸小糸・コイト': ['小糸', 'コイト', 'こいと'],
  'キンウ・でち公': ['キンウ', 'でち公'],
  'ゆず': ['ゆず', 'ユズ'],
  '雛桃・ヒナモ': ['雛桃', 'ヒナモ', 'ひなも', 'ひなもも'],
  'コイト顔文字': ['꒰( ˶ ᷇ 𖥦 ᷆ ˵ )꒰'],
  'おへへ': ['おへへ'], 'でち': ['でち'], 'あたち': ['あたち'],
  'なのです': ['なのです'], '金麦': ['金麦'],
  '食事': ['ごはん', 'ご飯', '飯', 'ラーメン', 'カレー', '焼肉', '食べ'],
  '雑談・日常': ['雑談', '仕事', '天気', 'おはよう', 'おやすみ'],
  '友人戦': ['友人戦'],
  '麻雀・対局': ['麻雀', '対局', '何切る', '牌譜', '段位', '立直', 'リーチ'],
  'キャラ・画像': ['キャラ', '推し', '衣装', '画像', 'かわいい', '可愛い'],
}


class TextParser(HTMLParser):
  def __init__(self):
    super().__init__(convert_charrefs=True)
    self.parts = []
    self.suppressed = 0

  def handle_starttag(self, tag, attrs):
    if tag in ['script', 'style']:
      self.suppressed += 1
    if tag in ['br', 'hr', 'p', 'div'] and not self.suppressed:
      self.parts.append('\n')

  def handle_endtag(self, tag):
    if tag in ['script', 'style']:
      self.suppressed = max(0, self.suppressed - 1)

  def handle_data(self, data):
    if not self.suppressed:
      self.parts.append(data)


def plain_text(body):
  parser = TextParser()
  parser.feed(body)
  return ''.join(parser.parts).strip()


def previous_threads(thread):
  first = next((r for r in thread['thread_array'] if r.get('num') == 1), None)
  if not first or '前スレ' not in first['body']:
    return []
  section = first['body'].split('前スレ', 1)[1].split('<hr', 1)[0]
  return list(dict.fromkeys(re.findall(r'https?://[\w.-]+/(?:[\w-]+/)?(?:test/read|t\.{3}(?:ad|d))\.cgi/mj/(\d{9,11})(?!\d)', section)))


def hold_reason(body, text, repeats):
  if re.search(r'(?:h?ttps?://|data-href=|<img\b)', body, re.I):
    return '画像・リンク'
  if len(text) >= 1000 or text.count('\n') >= 49 or len(re.findall(r'<br\s*/?>', body, re.I)) >= 49:
    return '長文・多行'
  if re.search(r'[\u2500-\u257f\u2580-\u259f]', text):
    return 'AA候補'
  if re.search(r'グロ(?:画像|動画|AA|注意)|死体|蓮コラ|切断画像', text):
    return 'グロを直接示す語'
  if len(text) >= 30 and repeats[text] >= 20:
    return '同一本文の反復'
  return None


def excerpt(text):
  text = re.sub(r'\b(?:\d{1,3}\.){3}\d{1,3}\b|\bID:\S+|(?:ﾜｯﾁｮｲ|ｽﾌﾟ|ｱｳｱｳ)\S*', '[redacted]', text)
  return text.replace('\n', ' ')[:160]


def analyze(archive, seed):
  if seed not in archive:
    raise ValueError('起点ログがありません')
  for thread in archive.values():
    if not isinstance(thread.get('thread_array'), list):
      raise ValueError('thread_array が配列ではありません')
    for row in thread['thread_array']:
      if not isinstance(row.get('body'), str) or not isinstance(row.get('num'), int):
        raise ValueError('本文または番号の形式が不正です')
  selected, missing, edges, pending = set(), set(), {}, [seed]
  while pending:
    key = pending.pop()
    if key in selected:
      continue
    if key not in archive:
      missing.add(key)
      continue
    selected.add(key)
    edges[key] = previous_threads(archive[key])
    pending.extend(edges[key])
  counts, exclusions, totals = Counter(), Counter(), Counter()
  samples, parts, inventory = defaultdict(list), defaultdict(list), []
  for key in sorted(selected):
    thread = archive[key]
    rows = thread['thread_array']
    totals['selectedPosts'] += len(rows)
    explicit = re.search(r'Part\s*(\d+)', thread.get('title', ''), re.I)
    part = int(explicit[1]) if explicit else None
    if part is not None:
      parts[part].append(key)
    else:
      totals['nonstandardTitles'] += 1
    inventory.append({'threadId': key, 'title': thread.get('title', ''), 'rows': len(rows), 'explicitPart': part, 'previous': edges[key]})
    normalized = [(row, plain_text(row['body'])) for row in rows]
    unique_texts = {}
    for row, text in normalized:
      if 5 < row['num'] < 1001:
        unique_texts.setdefault(row['num'], text)
    repeats = Counter(unique_texts.values())
    numbers = set()
    for row, text in normalized:
      if row['num'] in numbers:
        totals['duplicates'] += 1
        continue
      numbers.add(row['num'])
      if row['num'] <= 5 or row['num'] >= 1001 or not text:
        totals['structuralPosts'] += 1
        continue
      reason = hold_reason(row['body'], text, repeats)
      if reason:
        exclusions[reason] += 1
        totals['heldPosts'] += 1
        continue
      totals['includedPosts'] += 1
      for label, words in DICTIONARY.items():
        if any(word in text for word in words):
          counts[label] += 1
          if len(samples[label]) < 8 and sum(s['source_thread_id'] == key for s in samples[label]) < 2:
            samples[label].append({'source_thread_id': key, 'post_number': row['num'], 'evidence_excerpt_internal': excerpt(text)})
  summary = {
    'status': 'corpus-verified', 'verified': True, 'source': ['docs/corpus-analysis.md'], 'confidence': 'medium',
    'archiveFiles': len(archive), 'archivePosts': sum(len(t['thread_array']) for t in archive.values()),
    'selectedThreads': len(selected), 'otherThreads': len(archive) - len(selected),
    **{name: totals[name] for name in ['selectedPosts', 'duplicates', 'structuralPosts', 'heldPosts', 'includedPosts', 'nonstandardTitles']},
    'missingPredecessors': len(missing), 'multiplePredecessors': sum(len(v) > 1 for v in edges.values()),
    'duplicatePartNumbers': sorted(p for p, keys in parts.items() if len(keys) > 1),
    'explicitPartRange': [min(parts), max(parts)] if parts else None,
    'exclusions': dict(sorted(exclusions.items())), 'mentions': {label: counts[label] for label in DICTIONARY},
  }
  return {'summary': summary, 'inventory': inventory, 'missingThreadIds': sorted(missing), 'otherThreadIds': sorted(set(archive) - selected), 'samples': dict(samples)}


def render_report(s):
  lines = ['# 投入ログの再検証結果', '', '出典状態: `corpus-verified`。機械集計した範囲の事実であり、公式設定やキャラ人気の検証ではない。', '', '## 収録と対象', '',
    f"- 全アーカイブ: {s['archiveFiles']:,}ファイル / {s['archivePosts']:,}レス行。",
    f"- Part3099の前スレ参照から到達した対象: {s['selectedThreads']:,}スレ / {s['selectedPosts']:,}レス行。",
    f"- 対象集合に到達しないログ: {s['otherThreads']}ファイル。本流ではないと断定したものではない。",
    f"- 複数前スレ参照: {s['multiplePredecessors']}スレ。未収録の参照先: {s['missingPredecessors']}件。",
    f"- 明示的なPart表記の範囲: {s['explicitPartRange']}。番号を自動確定しない改変タイトル: {s['nonstandardTitles']}スレ。",
    f"- 同番号の別ログ: {s['duplicatePartNumbers']}。この参照集合は唯一の本流として確定していない。", '', '## 集計母数', '',
    f"- テンプレート・終了行・空本文: {s['structuralPosts']:,}件。重複レス番号: {s['duplicates']:,}件。",
    f"- 保守的に保留した本文: {s['heldPosts']:,}件。",
    f"- 辞書集計に使用した本文: **{s['includedPosts']:,}件**。", '', '| 保留理由 | 件数 |', '| --- | ---: |']
  lines += [f'| {key} | {value:,} |' for key, value in s['exclusions'].items()]
  lines += ['', '## 辞書によるレス言及数', '', '同一レス内の複数表記は1件。項目間は重複可能で、話題割合・人気・好感度を示さない。検索語は解析スクリプトの `DICTIONARY` に定義する。', '', '| 表記・検索項目 | レス数 |', '| --- | ---: |']
  lines += [f'| {key} | {value:,} |' for key, value in s['mentions'].items()]
  lines += ['', '## 限界', '', '- 通常の画像レスやAAも保留している。荒らしの完全な除外と誤除外率は未検証。', '- 語の出現は文脈の一致を保証しない。食材のゆず、引用、皮肉も含み得る。', '- 語尾とキャラの結び付き、好意の度合い、キャラ属性の配点はこの集計だけでは確定しない。', '- 公式プロフィールと診断用属性重みは未確認。公開アプリへの本文・投稿者情報・画像の転載は行わない。', '- 方法と除外条件は [corpus-analysis.md](corpus-analysis.md) を参照。', '']
  return '\n'.join(lines)


def main():
  parser = argparse.ArgumentParser()
  parser.add_argument('--seed', default='1791632135')
  args = parser.parse_args()
  root = Path(__file__).resolve().parent.parent
  archive, fingerprint = {}, sha256()
  for path in sorted((root / 'corpus').glob('*.json')):
    raw = path.read_bytes()
    fingerprint.update(path.name.encode())
    fingerprint.update(raw)
    archive[path.stem] = json.loads(raw)
  result = analyze(archive, args.seed)
  result['input_sha256'] = fingerprint.hexdigest()
  result['reviewed_at'] = datetime.now(timezone.utc).isoformat()
  output = root / 'corpus' / 'analysis'
  output.mkdir(exist_ok=True)
  (output / 'report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
  (root / 'docs' / 'corpus-report.md').write_text(render_report(result['summary']))
  print(json.dumps(result['summary'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
  main()
