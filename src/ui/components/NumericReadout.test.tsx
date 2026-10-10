// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Knob } from './Knob';
import { Slider } from './Slider';

afterEach(cleanup);

const open = () => fireEvent.click(screen.getByRole('button', { name: /^Edit Cutoff value/ }));
const field = () => screen.getByRole('textbox', { name: 'Cutoff value' }) as HTMLInputElement;

describe('numeric readout on a knob', () => {
  it('shows the value as a button that says it can be edited', () => {
    render(<Knob id="filter-cutoff" value={8000} onChange={() => {}} />);
    const b = screen.getByRole('button', { name: 'Edit Cutoff value. Currently 8.00 kHz' });
    expect(b).toHaveTextContent('8.00 kHz');
  });

  it('Enter on the focused knob opens the editor (no need to Tab to the number)', () => {
    render(<Knob id="filter-cutoff" value={8000} onChange={() => {}} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Cutoff' }), { key: 'Enter' });
    expect(field()).toBeInTheDocument();
    expect(document.activeElement).toBe(field());
  });

  it('Enter on a focused slider opens its editor too', () => {
    render(<Slider id="mix-osc-a" value={0.8} onChange={() => {}} />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Oscillator A level' }), { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Oscillator A level value' })).toBeInTheDocument();
  });

  it('Enter does nothing on a disabled knob', () => {
    render(<Knob id="osc-a-pulse-width" value={0.5} onChange={() => {}} disabled />);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Pulse width A' }), { key: 'Enter' });
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('click opens a text field with the current value selected', () => {
    render(<Knob id="filter-cutoff" value={8000} onChange={() => {}} />);
    open();
    expect(field().value).toBe('8.00 kHz');
    expect(document.activeElement).toBe(field());
    expect(field().selectionStart).toBe(0);
    expect(field().selectionEnd).toBe(field().value.length);
  });

  it('Enter commits a typed value with units, closes the field and gives the focus back', () => {
    const onChange = vi.fn();
    render(<Knob id="filter-cutoff" value={8000} onChange={onChange} />);
    open();
    fireEvent.change(field(), { target: { value: '2.5k' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]![0]).toBeCloseTo(2500, 6);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Edit Cutoff value/ }));
  });

  it('Escape cancels without changing anything', () => {
    const onChange = vi.fn();
    render(<Knob id="filter-cutoff" value={8000} onChange={onChange} />);
    open();
    fireEvent.change(field(), { target: { value: '99' } });
    fireEvent.keyDown(field(), { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('clicking away commits a readable value', () => {
    const onChange = vi.fn();
    render(<Knob id="filter-cutoff" value={8000} onChange={onChange} />);
    open();
    fireEvent.change(field(), { target: { value: '440' } });
    fireEvent.blur(field());
    expect(onChange).toHaveBeenCalledWith(440);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('an unreadable value keeps the field open with a message and changes nothing', () => {
    const onChange = vi.fn();
    render(<Knob id="filter-cutoff" value={8000} onChange={onChange} />);
    open();
    fireEvent.change(field(), { target: { value: 'loud' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert').textContent).toMatch(/frequency/);
    // typing again clears the message
    fireEvent.change(field(), { target: { value: '1k' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onChange.mock.calls[0]![0]).toBeCloseTo(1000, 6);
  });

  it('clicking away from an unreadable value drops it instead of trapping the focus', () => {
    const onChange = vi.fn();
    render(<Knob id="filter-cutoff" value={8000} onChange={onChange} />);
    open();
    fireEvent.change(field(), { target: { value: 'loud' } });
    fireEvent.blur(field());
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('out-of-range values are clamped, like dragging', () => {
    const onChange = vi.fn();
    render(<Knob id="filter-cutoff" value={8000} onChange={onChange} />);
    open();
    fireEvent.change(field(), { target: { value: '90k' } });
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(20000);
  });

  it('committing the same value does not call onChange', () => {
    const onChange = vi.fn();
    render(<Knob id="filter-cutoff" value={8000} onChange={onChange} />);
    open();
    fireEvent.keyDown(field(), { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keystrokes in the field do not reach window handlers (no notes, no shortcuts)', () => {
    const seen = vi.fn();
    window.addEventListener('keydown', seen);
    render(<Knob id="filter-cutoff" value={8000} onChange={() => {}} />);
    open();
    fireEvent.keyDown(field(), { key: 'c', code: 'KeyC' });
    fireEvent.keyDown(field(), { key: '?', code: 'Slash' });
    window.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
  });

  it('a disabled control cannot be edited', () => {
    render(<Knob id="osc-a-pulse-width" value={0.5} onChange={() => {}} disabled />);
    const b = screen.getByRole('button', { name: /^Edit Pulse width A value/ });
    expect(b).toBeDisabled();
  });

  it('works for time, percent and dB controls too', () => {
    const t = vi.fn();
    const { unmount } = render(<Knob id="amp-env-attack" value={0.005} onChange={t} />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit Amp attack value/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '300 ms' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(t.mock.calls[0]![0]).toBeCloseTo(0.3, 9);
    unmount();
    const v = vi.fn();
    render(<Knob id="master-volume" value={-12} onChange={v} />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit Master volume value/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '-6' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(v).toHaveBeenCalledWith(-6);
  });
});

describe('numeric readout on a slider', () => {
  it('edits the same way', () => {
    const onChange = vi.fn();
    render(<Slider id="mix-osc-a" value={0.8} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /^Edit Oscillator A level value/ }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '35' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onChange.mock.calls[0]![0]).toBeCloseTo(0.35, 9);
  });
});
