// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ServicesContext } from '@/app/context';
import { createMockServices } from '@/app/mock-services';
import { ProjectMenu } from './ProjectMenu';

afterEach(cleanup);

function mount() {
  const services = createMockServices();
  render(
    <ServicesContext.Provider value={services}>
      <ProjectMenu />
    </ServicesContext.Provider>,
  );
  const open = () => fireEvent.click(screen.getByRole('button', { name: 'Project' }));
  return { services, open };
}

describe('ProjectMenu', () => {
  it('the Project button is a disclosure for a dialog, closed at first', () => {
    const { open } = mount();
    const button = screen.getByRole('button', { name: 'Project' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog', { name: 'Project' })).toBeNull();
    open();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('dialog', { name: 'Project' })).toBeInTheDocument();
  });

  it('shows the autosave status next to the button', () => {
    const { services } = mount();
    const status = screen.getByTestId('autosave-status');
    expect(status).toHaveTextContent('');
    act(() => services.persistence.store.setState({ status: 'saving' }));
    expect(status).toHaveTextContent('Saving…');
    act(() => services.persistence.store.setState({ status: 'saved' }));
    expect(status).toHaveTextContent('Saved');
    act(() => services.persistence.store.setState({ status: 'error' }));
    expect(status).toHaveTextContent('Could not save');
  });

  it('shows a restore notice with a way to dismiss it', () => {
    const { services } = mount();
    act(() => services.persistence.store.setState({ notice: 'Your saved project could not be read (x).' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Your saved project could not be read');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss project notice' }));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the name field renames the project', () => {
    const { services, open } = mount();
    open();
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'Ballad' } });
    expect(services.projectStore.getState().project.name).toBe('Ballad');
  });

  it('New project asks first when there are changes not saved to a file', () => {
    const { services, open } = mount();
    open();
    act(() => services.projectStore.getState().setTempo(150));
    expect(screen.getByTestId('unsaved-state')).toHaveTextContent('Changes not saved to a file');
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    const confirm = screen.getByRole('group', { name: 'Confirm new project' });
    expect(within(confirm).getByText(/Discard the changes/)).toBeInTheDocument();
    expect(services.projectStore.getState().project.tempo).toBe(150); // nothing discarded yet

    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(services.projectStore.getState().project.tempo).toBe(150);
    expect(screen.queryByRole('group', { name: 'Confirm new project' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start new project' }));
    expect(services.projectStore.getState().project.tempo).toBe(120);
    expect(screen.getByText('Started a new project.')).toBeInTheDocument();
  });

  it('New project does not ask when everything is saved to a file', () => {
    const { services, open } = mount();
    open();
    services.projectStore.getState().setTempo(150);
    services.projectFileStore.getState().saveToFile();
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    expect(screen.queryByRole('group', { name: 'Confirm new project' })).toBeNull();
    expect(services.projectStore.getState().project.tempo).toBe(120);
  });

  it('a bad file is reported as an alert and changes nothing', () => {
    const { services, open } = mount();
    open();
    act(() => void services.projectFileStore.getState().openText('{ not json'));
    expect(screen.getByRole('alert')).toHaveTextContent('Could not open this file: the file is not valid JSON');
    expect(services.projectStore.getState().project.name).toBe('Untitled');
  });

  it('Escape closes the panel and returns focus to the button', () => {
    const { open } = mount();
    open();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Project' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Project' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Project' })).toHaveFocus();
  });
});
