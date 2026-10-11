import { useEffect, useRef, useState } from 'react';
import { loadContent } from './content';
import { diagnose, type Answers, type Diagnosis } from './domain/diagnosis';
import { dimensions } from './domain/schema';
import './styles.css';

type Content = ReturnType<typeof loadContent>;

function Sources({ content }: { content: Content }) {
  return (
    <details className="sources">
      <summary>出典と診断のしくみ</summary>
      <div className="source-grid">
        {content.presentation.sourceNotes.map((note) => (
          <section key={note.label}>
            <h3>{note.label}</h3>
            <p>{note.text}</p>
          </section>
        ))}
      </div>
      <p className="source-reference">参照資料：research-status.md / thread-culture.md / character-profiles.md / diagnosis-spec.md / corpus-analysis.md / corpus-report.md</p>
    </details>
  );
}

export function ResultView({ result, content }: { result: Exclude<Diagnosis, { status: 'incomplete' }>; content: Content }) {
  const display = content.presentation;
  const recommendation = result.status === 'ready' ? result.ranking[0] : null;
  return (
    <>
      {recommendation ? (
        <section className="recommendation" aria-labelledby="recommendation-title">
          <span className="eyebrow">あなたへのおすすめ</span>
          <h3 id="recommendation-title">{recommendation.character.name}</h3>
          <p className="compatibility">{recommendation.compatibility}<span> / 100</span></p>
          <p className="caption">相性度はこのアプリ内の相対指標です。</p>
          <p>{recommendation.reasons.length
            ? `回答の「${recommendation.reasons.map((dimension) => display.dimensions[dimension].label).join('」「')}」の傾向が、レビュー済みの診断重みと近い結果でした。`
            : '回答と診断重みに共通する傾向はありませんでした。'}</p>
          <div className="profile-block">
            <h4>出典確認済みの公式紹介</h4>
            <p>{recommendation.character.officialProfile!.text}</p>
            <p className="caption">出典：{recommendation.character.officialProfile!.evidence.source.join(' / ')}</p>
          </div>
          {recommendation.character.threadInterpretation && (
            <div className="profile-block">
              <h4>スレでの扱い（公式設定とは別）</h4>
              <p>{recommendation.character.threadInterpretation.text}</p>
              <p className="caption">確認状態：{recommendation.character.threadInterpretation.evidence.status} ／ 出典：{recommendation.character.threadInterpretation.evidence.source.join(' / ')}</p>
            </div>
          )}
          <p className="caption">診断重み：人手レビュー済みの仮説 ／ 出典：{recommendation.character.traits!.evidence.source.join(' / ')}</p>
          {result.status === 'ready' && result.ranking.length > 1 && (
            <p className="runner-up">次点：{result.ranking[1].character.name} · 相性度 {result.ranking[1].compatibility} / 100</p>
          )}
        </section>
      ) : (
        <section className="notice" aria-labelledby="notice-title">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <h3 id="notice-title">{result.status === 'no-signal' ? '傾向を判定できませんでした' : 'キャラ診断は準備中'}</h3>
            <p>{result.status === 'no-signal'
              ? '今回の回答では属性点が得られなかったため、相性度を計算できません。'
              : '出典確認と属性レビューを終えたキャラがまだいません。今は回答の傾向を振り返るところまで。キャラ推薦はデータが揃ってからお届けします。'}</p>
          </div>
        </section>
      )}
      <div className="traits" aria-label="回答傾向">
        {dimensions.map((dimension) => {
          const value = Math.round(result.summary.normalized[dimension] * 100);
          return (
            <div className="trait" key={dimension}>
              <div className="trait-heading">
                <span className="trait-name">{display.dimensions[dimension].label}</span>
                <span className="trait-value">{value}<small>%</small></span>
              </div>
              <div className="trait-track" aria-hidden="true"><div style={{ width: `${value}%` }} /></div>
              <p>{display.dimensions[dimension].description}</p>
            </div>
          );
        })}
      </div>
      <p className="caption">各属性の最大点に対する回答点の割合です。合計100%の構成比ではなく、性格やキャラ相性を確定する値でもありません。</p>
      <blockquote className="thread-line">{display.resultLine}<span>アプリ用の創作ひとこと</span></blockquote>
    </>
  );
}

function DiagnosisApp({ content }: { content: Content }) {
  const [page, setPage] = useState<'welcome' | 'question' | 'result'>('welcome');
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const mounted = useRef(false);
  const questions = content.questions.questions;
  const display = content.presentation;
  const current = questions[index];
  const result = page === 'result' ? diagnose(questions, content.characters.characters, answers) : null;

  useEffect(() => {
    if (mounted.current) heading.current?.focus();
    mounted.current = true;
  }, [page, index]);

  function restart() {
    setAnswers({});
    setIndex(0);
    setPage('welcome');
  }

  return (
    <>
      <a className="skip-link" href="#main">本文へ移動</a>
      <div className="app-shell">
        <header className="site-header">
          <div className="brand"><span className="tile-logo" aria-hidden="true">雀</span><span>{display.title}</span></div>
          <span className="header-label">非公式 · プロトタイプ</span>
        </header>
        <main id="main">
          <div className="intro-strip"><span>雑談も、麻雀も、推しの話も。</span><span className="edition">THREAD CULTURE / 01</span></div>
          {page === 'welcome' && (
            <section className="welcome card">
              <div className="welcome-copy">
                <p className="eyebrow">{display.subtitle}</p>
                <h1 ref={heading} tabIndex={-1}>いつものスレに、<br />あなたの好きがある。</h1>
                <p className="lead">{display.opening}</p>
                <div className="welcome-meta"><span>10問・選択式</span><span>回答の保存なし</span><span>戻って変更OK</span></div>
                <button className="primary-button" onClick={() => setPage('question')}>10問に答えてみる<span aria-hidden="true"> →</span></button>
                <p className="caption">現在は回答傾向の集計まで。キャラ推薦のデータは準備中です。</p>
              </div>
              <div className="welcome-art" aria-hidden="true">
                <span className="art-label">今日も、ひと息。</span>
                <div className="tile-table"><span className="mahjong-tile tile-back">發</span><span className="mahjong-tile tile-front">中</span><span className="mahjong-tile tile-side">白</span></div>
                <span className="art-caption">おへへ、と腰をおろして。</span>
              </div>
            </section>
          )}
          {page === 'question' && (
            <section className="question-card card">
              <div className="question-top"><span className="eyebrow">あなたの楽しみ方を聞かせて</span><span className="question-count">{String(index + 1).padStart(2, '0')} <span>/ {questions.length}</span></span></div>
              <progress max={questions.length} value={index} aria-label="質問の進捗" />
              <p className="caption progress-label">{index} / {questions.length}問の回答を確認済み</p>
              <h1 ref={heading} tabIndex={-1} id="question-title">{current.text}</h1>
              <p className="question-hint">今の気分に一番近いものを、ひとつ。</p>
              <fieldset className="answer-list" aria-labelledby="question-title" key={current.id}>
                <legend className="sr-only">回答の選択肢</legend>
                {current.answers.map((answer, position) => (
                  <label className={`answer-option ${answers[current.id] === answer.id ? 'selected' : ''}`} key={answer.id}>
                    <input type="radio" name={current.id} value={answer.id} checked={answers[current.id] === answer.id} onChange={() => setAnswers((previous) => ({ ...previous, [current.id]: answer.id }))} />
                    <span className="answer-letter" aria-hidden="true">{String.fromCharCode(65 + position)}</span>
                    <span>{answer.text}</span>
                    <span className="answer-check" aria-hidden="true">{answers[current.id] === answer.id ? '✓' : ''}</span>
                  </label>
                ))}
              </fieldset>
              <div className="question-actions">
                <button className="secondary-button" onClick={() => index === 0 ? setPage('welcome') : setIndex(index - 1)}>{index === 0 ? 'はじめの画面へ' : '前の質問へ'}</button>
                <button className="primary-button" disabled={!answers[current.id]} onClick={() => index === questions.length - 1 ? setPage('result') : setIndex(index + 1)}>{index === questions.length - 1 ? '結果を見る' : '次の質問へ'}</button>
              </div>
              <p className="caption question-footer">質問と配点は診断用の仮説です。正解・不正解はありません。</p>
            </section>
          )}
          {page === 'result' && result && result.status !== 'incomplete' && (
            <section className="result-card card">
              <p className="eyebrow">10問、おつかれさまでした</p>
              <h1 ref={heading} tabIndex={-1}>あなたの楽しみ方</h1>
              <p className="question-hint">いつものスレで、どんな時間を過ごしたい？</p>
              <ResultView result={result} content={content} />
              <div className="question-actions">
                <button className="secondary-button" onClick={() => { setIndex(questions.length - 1); setPage('question'); }}>回答を見直す</button>
                <button className="primary-button" onClick={restart}>もう一度はじめる</button>
              </div>
            </section>
          )}
          <Sources content={content} />
        </main>
        <footer className="site-footer"><span>{display.title}</span><p>雀魂の非公式・娯楽用アプリです。運営・権利者とは関係ありません。</p></footer>
      </div>
    </>
  );
}

export default function App() {
  let content: Content;
  try {
    content = loadContent();
  } catch {
    return <main className="app-shell"><section className="card error-card" role="alert"><h1>データを読み込めませんでした</h1><p>質問やキャラのデータ形式に不備があります。データを確認してから、もう一度お試しください。</p></section></main>;
  }
  return <DiagnosisApp content={content} />;
}
