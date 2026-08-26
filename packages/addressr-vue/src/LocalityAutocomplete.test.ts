// @jtbd JTBD-003 + JTBD-102
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import LocalityAutocomplete from './LocalityAutocomplete.vue';

function mockResponse(body: unknown, headers: Record<string, string> = {}, url = '') {
  const resp = new Response(JSON.stringify(body), { status: 200, headers: new Headers(headers) });
  Object.defineProperty(resp, 'url', { value: url });
  return resp;
}

const rootResponse = () =>
  mockResponse(
    {},
    { link: '</localities{?q}>; rel="https://addressr.io/rels/locality-search"' },
    'https://addressr.p.rapidapi.com/',
  );

const searchResponse = () =>
  mockResponse(
    [
      { name: 'SYDNEY', state: { name: 'New South Wales', abbreviation: 'NSW' }, postcode: '2000', score: 19, pid: 'LOC-1' },
      { name: 'SYDNEY SOUTH', state: { name: 'New South Wales', abbreviation: 'NSW' }, postcode: '1234', score: 15, pid: 'LOC-2' },
    ],
    {},
    'https://addressr.p.rapidapi.com/localities?q=syd',
  );

describe('LocalityAutocomplete (Vue)', () => {
  it('renders combobox with accessible label', () => {
    const mockFetch = vi.fn();
    render(LocalityAutocomplete, { props: { fetchImpl: mockFetch } });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Search Australian suburbs and towns')).toBeInTheDocument();
  });

  it('has name attribute defaulting to "locality"', () => {
    const mockFetch = vi.fn();
    render(LocalityAutocomplete, { props: { fetchImpl: mockFetch } });
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'locality');
  });

  it('has aria-atomic polite status live region', () => {
    const mockFetch = vi.fn();
    render(LocalityAutocomplete, { props: { fetchImpl: mockFetch } });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('displays locality results after typing', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(LocalityAutocomplete, { props: { debounceMs: 10, fetchImpl: mockFetch } });

    await userEvent.type(screen.getByRole('combobox'), 'syd');

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
  });

  it('emits select with LocalitySearchResult when option chosen', async () => {
    const onSelect = vi.fn();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(LocalityAutocomplete, {
      props: { debounceMs: 10, fetchImpl: mockFetch, onSelect },
    });

    await userEvent.type(screen.getByRole('combobox'), 'syd');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    await userEvent.click(screen.getAllByRole('option')[0]);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'SYDNEY', postcode: '2000' }),
      );
    });
  });

  it('announces count in status live region', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(LocalityAutocomplete, { props: { debounceMs: 10, fetchImpl: mockFetch } });

    await userEvent.type(screen.getByRole('combobox'), 'syd');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('2 suburbs and towns found');
    });
  });
});
