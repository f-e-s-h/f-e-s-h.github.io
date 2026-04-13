import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PokerTrainer from '../App.jsx';

function getFirstActionButton(){
  const labels = [
    /Fold/i,
    /^Check$/i,
    /^Call$/i,
    /Limp/i,
    /Bet Small/i,
    /Bet Medium/i,
    /Bet Large/i,
    /Raise Small/i,
    /Raise Medium/i,
    /Raise Large/i,
  ];

  for(const label of labels){
    const btn = screen.queryByRole('button', { name: label });
    if(btn) return btn;
  }

  return null;
}

describe('PokerTrainer smoke checks', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders default All Skills tab title', () => {
    render(<PokerTrainer />);

    expect(screen.getByRole('heading', { name: 'All Skills Trainer' })).toBeInTheDocument();
    expect(screen.getByText(/Poker Training/i)).toBeInTheDocument();
  });

  it('switches to Postflop tab and shows action prompt', () => {
    render(<PokerTrainer />);

    fireEvent.click(screen.getByRole('button', { name: 'Postflop' }));

    expect(screen.getByRole('heading', { name: 'Postflop v2 Trainer' })).toBeInTheDocument();
    expect(screen.getByText(/Choose your action/i)).toBeInTheDocument();
  });

  it('records a Postflop action and shows feedback state', () => {
    render(<PokerTrainer />);

    fireEvent.click(screen.getByRole('button', { name: 'Postflop' }));

    const actionButton = getFirstActionButton();
    expect(actionButton).not.toBeNull();
    fireEvent.click(actionButton);

    expect(screen.getByText(/Street score:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /(Continue|Next Hand)/i })).toBeInTheDocument();
  });

  it('persists selected tab in localStorage between mounts', () => {
    const mounted = render(<PokerTrainer />);

    fireEvent.click(screen.getByRole('button', { name: 'Postflop' }));
    expect(screen.getByRole('heading', { name: 'Postflop v2 Trainer' })).toBeInTheDocument();

    mounted.unmount();
    render(<PokerTrainer />);

    expect(screen.getByRole('heading', { name: 'Postflop v2 Trainer' })).toBeInTheDocument();
  });

  it('hydrates Pot Odds stats from localStorage on mount', () => {
    window.localStorage.setItem('poker_active_tab', JSON.stringify('potodds'));
    window.localStorage.setItem('poker_stats_0', JSON.stringify({correct: 7, total: 11}));
    window.localStorage.setItem('poker_streak_0', JSON.stringify(3));
    window.localStorage.setItem('poker_best_0', JSON.stringify(6));

    render(<PokerTrainer />);

    const correctCell = screen.getByText('Correct').parentElement;
    const totalCell = screen.getByText('Total').parentElement;
    const streakCell = screen.getByText('Streak').parentElement;
    const bestCell = screen.getByText('Best').parentElement;

    expect(correctCell?.firstChild).toHaveTextContent('7');
    expect(totalCell?.firstChild).toHaveTextContent('11');
    expect(streakCell?.firstChild).toHaveTextContent('3');
    expect(bestCell?.firstChild).toHaveTextContent('6');
  });

  it('persists Pot Odds stat updates across remounts', async () => {
    const mounted = render(<PokerTrainer />);

    fireEvent.click(screen.getByRole('button', { name: 'Pot Odds' }));
    fireEvent.click(screen.getByRole('button', { name: 'CALL' }));

    await waitFor(() => {
      const stats = JSON.parse(window.localStorage.getItem('poker_stats_0') ?? '{}');
      expect(stats.total).toBe(1);
    });

    mounted.unmount();
    render(<PokerTrainer />);
    fireEvent.click(screen.getByRole('button', { name: 'Pot Odds' }));

    const persistedStats = JSON.parse(window.localStorage.getItem('poker_stats_0') ?? '{}');
    expect(persistedStats.total).toBe(1);
  });
});

describe('All Skills keyboard shortcuts', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('maps number keys to visible action order', async () => {
    render(<PokerTrainer />);

    expect(screen.getByText(/Choose your action/i)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /(Continue|Next Hand)/i })).toBeInTheDocument();
    });
  });

  it('uses Enter to Continue or Next Hand after a decision', async () => {
    render(<PokerTrainer />);

    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /(Continue|Next Hand)/i })).toBeInTheDocument();
    });

    fireEvent.keyDown(window, { key: 'Enter', code: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText(/Choose your action/i)).toBeInTheDocument();
    });
  });

  it('does not trigger action shortcuts while position map is open', () => {
    render(<PokerTrainer />);

    fireEvent.click(screen.getByRole('button', { name: /Position Map/i }));
    expect(screen.getByRole('dialog', { name: /Expanded Position Map/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: '1', code: 'Digit1' });

    expect(screen.getByText(/Choose your action/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /(Continue|Next Hand)/i })).not.toBeInTheDocument();
  });

  it('ignores modified shortcut keys', () => {
    render(<PokerTrainer />);

    fireEvent.keyDown(window, { key: '1', code: 'Digit1', ctrlKey: true });

    expect(screen.getByText(/Choose your action/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /(Continue|Next Hand)/i })).not.toBeInTheDocument();
  });
});
