import { fireEvent, render, screen } from '@testing-library/react';
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
});
