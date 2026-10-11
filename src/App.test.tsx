import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import App, { ResultView } from './App';
import * as contentModule from './content';
import { diagnose } from './domain/diagnosis';

describe('診断の画面', () => {
  it('10問を完了し、根拠のないキャラ推薦をせず、再診断できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '10問に答えてみる' }));
    for (let index = 0; index < 10; index++) {
      expect(screen.getByRole('progressbar')).toHaveAttribute('value', String(index));
      await user.click(screen.getAllByRole('radio')[0]);
      await user.click(screen.getByRole('button', { name: index === 9 ? '結果を見る' : '次の質問へ' }));
    }
    expect(screen.getByRole('heading', { name: 'あなたの楽しみ方' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'キャラ診断は準備中' })).toBeInTheDocument();
    expect(screen.getByText('雑談', { selector: '.trait-name' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'もう一度はじめる' }));
    expect(screen.getByRole('button', { name: '10問に答えてみる' })).toBeInTheDocument();
  });

  it('未回答は進めず、戻ったときの回答を保持し変更できる', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '10問に答えてみる' }));
    expect(screen.getByRole('button', { name: '次の質問へ' })).toBeDisabled();
    await user.click(screen.getAllByRole('radio')[0]);
    await user.click(screen.getByRole('button', { name: '次の質問へ' }));
    await user.click(screen.getByRole('button', { name: '前の質問へ' }));
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    await user.click(screen.getAllByRole('radio')[1]);
    expect(screen.getAllByRole('radio')[1]).toBeChecked();
    await user.click(screen.getByRole('button', { name: '次の質問へ' }));
    await user.click(screen.getByRole('button', { name: '前の質問へ' }));
    expect(screen.getAllByRole('radio')[1]).toBeChecked();
  });

  it('出典説明で仮説と過去の分析要約を区別する', async () => {
    render(<App />);
    await userEvent.click(screen.getByText('出典と診断のしくみ'));
    expect(screen.getByText(/197スレ.*178,997件/)).toBeVisible();
    expect(screen.getByText(/質問・配点・6つの属性は、このアプリのための仮説/)).toBeVisible();
  });

  it('キーボードで回答し、次の質問にフォーカスを移す', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: '10問に答えてみる' }));
    expect(screen.getByRole('heading', { name: 'スレを開いて真っ先に見るのは？' })).toHaveFocus();
    await user.tab();
    expect(screen.getAllByRole('radio')[0]).toHaveFocus();
    await user.keyboard('[Space]');
    expect(screen.getAllByRole('radio')[0]).toBeChecked();
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: '次の質問へ' })).toHaveFocus();
    await user.keyboard('[Enter]');
    expect(screen.getByRole('heading', { name: '休日の理想に近いのは？' })).toHaveFocus();
  });

  it('推薦可能なデータでは公式紹介・スレ内の扱い・診断重みを分けて示す', () => {
    const content = contentModule.loadContent();
    const candidate = {
      ...content.characters.characters[0],
      name: 'テスト専用の架空候補',
      eligibleForDiagnosis: true,
      officialProfile: { text: 'テスト用の公式紹介', evidence: { ...content.characters.characters[0].evidence, verified: true } },
      threadInterpretation: { text: 'テスト用のスレでの扱い', evidence: content.characters.characters[0].evidence },
      traits: {
        weights: { chat: 5, mahjong: 0, character: 0, social: 2, humor: 1, calm: 4 },
        reviewed: true,
        evidence: content.presentation.evidence,
      },
    };
    const answers = Object.fromEntries(content.questions.questions.map((question) => [question.id, 'a']));
    const result = diagnose(content.questions.questions, [candidate], answers);
    if (result.status !== 'ready') throw new Error('推薦結果が必要');
    render(<ResultView result={result} content={content} />);
    expect(screen.getByRole('heading', { name: 'テスト専用の架空候補' })).toBeInTheDocument();
    expect(screen.getByText('相性度はこのアプリ内の相対指標です。')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '出典確認済みの公式紹介' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'スレでの扱い（公式設定とは別）' })).toBeInTheDocument();
    expect(screen.getByText(/診断重み：人手レビュー済みの仮説/)).toBeInTheDocument();
  });

  it('不正データは空白画面にせず読み込みエラーを示す', () => {
    vi.spyOn(contentModule, 'loadContent').mockImplementationOnce(() => { throw new Error('データ不備'); });
    render(<App />);
    expect(screen.getByRole('alert')).toHaveTextContent('データを読み込めませんでした');
    vi.restoreAllMocks();
  });
});
