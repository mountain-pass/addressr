// @jtbd JTBD-004 + JTBD-103
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import StateAutocomplete from './StateAutocomplete.svelte';

function mockResponse(body: unknown, headers: Record<string, string> = {}, url = '') {
  const resp = new Response(JSON.stringify(body), { status: 200, headers: new Headers(headers) });
  Object.defineProperty(resp, 'url', { value: url });
  return resp;
}

const rootResponse = () =>
  mockResponse(
    {},
    { link: '</states{?q}>; rel="https://addressr.io/rels/state-search"' },
    'https://addressr.p.rapidapi.com/',
  );

const searchResponse = () =>
  mockResponse(
    [
      { name: 'New South Wales', abbreviation: 'NSW' },
      { name: 'Northern Territory', abbreviation: 'NT' },
    ],
    {},
    'https://addressr.p.rapidapi.com/states?q=nsw',
  );

describe('StateAutocomplete (Svelte)', () => {
  it('renders with accessible label and combobox role', () => {
    const mockFetch = vi.fn();
    render(StateAutocomplete, { props: { fetchImpl: mockFetch } });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Search Australian states and territories')).toBeInTheDocument();
  });

  it('has name attribute defaulting to "state"', () => {
    const mockFetch = vi.fn();
    render(StateAutocomplete, { props: { fetchImpl: mockFetch } });
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'state');
  });

  it('has aria-atomic polite status live region', () => {
    const mockFetch = vi.fn();
    render(StateAutocomplete, { props: { fetchImpl: mockFetch } });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('displays state results after typing', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(StateAutocomplete, { props: { debounceMs: 10, fetchImpl: mockFetch } });

    await userEvent.type(screen.getByRole('combobox'), 'nsw');

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
  });

  it('calls onSelect with the StateSearchResult when option chosen', async () => {
    const onSelect = vi.fn();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(StateAutocomplete, { props: { debounceMs: 10, fetchImpl: mockFetch, onSelect } });

    await userEvent.type(screen.getByRole('combobox'), 'nsw');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    await userEvent.click(screen.getAllByRole('option')[0]);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New South Wales', abbreviation: 'NSW' }),
      );
    });
  });

  it('announces count in status live region', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(StateAutocomplete, { props: { debounceMs: 10, fetchImpl: mockFetch } });

    await userEvent.type(screen.getByRole('combobox'), 'nsw');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('2 states or territories found');
    });
  });
});
