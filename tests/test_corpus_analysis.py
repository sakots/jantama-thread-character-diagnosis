import unittest
from scripts.analyze_corpus import analyze, plain_text, previous_threads, render_report


def thread(body, posts=None):
  return {'title': 'テストスレ', 'thread_array': [{'num': 1, 'body': body}] + (posts or [])}


class CorpusAnalysisTests(unittest.TestCase):
  def test_html_text(self):
    self.assertEqual(plain_text('こんにちは<br>飯&amp;雑談'), 'こんにちは\n飯&雑談')

  def test_previous_links_only(self):
    body = '案内 https://example.org/test/read.cgi/mj/1111111111/<br>前スレ<br>https://egg.5ch.io/test/read.cgi/mj/2222222222/<br>https://egg.5ch.net/test/read.cgi/mj/3333333333/'
    self.assertEqual(previous_threads(thread(body)), ['2222222222', '3333333333'])

  def test_traversal_and_cycle(self):
    archive = {'2222222222': thread('前スレ https://egg.5ch.net/test/read.cgi/mj/1111111111/'), '1111111111': thread('前スレ https://egg.5ch.net/test/read.cgi/mj/2222222222/'), '3333333333': thread('無関係')}
    result = analyze(archive, '2222222222')
    self.assertEqual(result['summary']['selectedThreads'], 2)
    self.assertEqual(result['summary']['otherThreads'], 1)

  def test_previous_link_without_trailing_slash(self):
    self.assertEqual(previous_threads(thread('前スレ<br>https://egg.5ch.io/test/read.cgi/mj/1111111111')), ['1111111111'])

  def test_mobile_previous_link(self):
    self.assertEqual(previous_threads(thread('前スレ https://itest.5ch.io/egg/test/read.cgi/mj/1111111111')), ['1111111111'])

  def test_archived_abbreviated_link(self):
    self.assertEqual(previous_threads(thread('前スレ https://egg.5ch.io/t...ad.cgi/mj/1111111111')), ['1111111111'])

  def test_deduplication_and_mentions(self):
    posts = [{'num': 6, 'body': 'かずき かずき 一姫 飯'}, {'num': 6, 'body': 'かずき'}, {'num': 7, 'body': 'おばさんと雑談'}]
    result = analyze({'1111111111': thread('', posts)}, '1111111111')
    self.assertEqual(result['summary']['includedPosts'], 2)
    self.assertEqual(result['summary']['duplicates'], 1)
    self.assertEqual(result['summary']['mentions']['一姫・かずき'], 1)
    self.assertEqual(result['summary']['mentions']['雑談・日常'], 1)

  def test_quarantine(self):
    bodies = ['https://example.com/image.jpg かずき', '┏━━┓', 'グロ画像', '長' * 1000, '<br>' * 50 + '飯', '普通の飯の話']
    result = analyze({'1111111111': thread('', [{'num': i + 6, 'body': b} for i, b in enumerate(bodies)])}, '1111111111')
    self.assertEqual(result['summary']['includedPosts'], 1)
    self.assertEqual(result['summary']['heldPosts'], 5)

  def test_flood(self):
    posts = [{'num': i + 6, 'body': '同じ文章のフラッド候補です。' * 3} for i in range(20)]
    self.assertEqual(analyze({'1111111111': thread('', posts)}, '1111111111')['summary']['heldPosts'], 20)

  def test_duplicate_rows_do_not_make_a_flood(self):
    posts = [{'num': 6, 'body': '重複して読み込まれた通常の本文です。' * 2} for _ in range(20)]
    s = analyze({'1111111111': thread('', posts)}, '1111111111')['summary']
    self.assertEqual(s['includedPosts'], 1)
    self.assertEqual(s['duplicates'], 19)

  def test_missing_source_and_bad_data(self):
    with self.assertRaises(ValueError):
      analyze({}, '1111111111')
    with self.assertRaises(ValueError):
      analyze({'1111111111': {'thread_array': [{'num': 6, 'body': None}]}}, '1111111111')

  def test_public_report_has_no_raw_material(self):
    archive = {'1111111111': thread('前スレ https://egg.5ch.net/test/read.cgi/mj/2222222222/', [{'num': 6, 'body': '秘密の本文 かずき', 'id': 'SECRET-ID', 'mname': 'SECRET-NAME'}])}
    result = analyze(archive, '1111111111')
    report = render_report(result['summary'])
    for secret in ['1111111111', '2222222222', '秘密の本文', 'SECRET-ID', 'SECRET-NAME', 'https://egg']:
      self.assertNotIn(secret, report)


if __name__ == '__main__':
  unittest.main()
