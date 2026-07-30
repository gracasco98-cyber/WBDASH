import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

function Hello({ name }: { name: string }) {
  return <span>Hello {name}</span>;
}

describe('rtl smoke', () => {
  it('renders', () => {
    render(<Hello name="Hat" />);
    expect(screen.getByText('Hello Hat')).toBeInTheDocument();
  });
});
