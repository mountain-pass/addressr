// @jtbd JTBD-003 (developer) + JTBD-102 (end-user)
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocalityAutocomplete } from './LocalityAutocomplete';

function mockResponse(body: unknown, headers: Record<string, string> = {}, url = '') {
  const resp = new Response(JSON.stringify(body), {
    status: 200,
    headers: new Headers(headers),
  });
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
      { name: 'SYDNEY', state: { name: 'New South Wales', abbreviation: 'NSW' }, postcode: '2000', score: 19, pid: 'LOC-NSW-SYDNEY' },
      { name: 'SYDNEY SOUTH', state: { name: 'New South Wales', abbreviation: 'NSW' }, postcode: '1234', score: 15, pid: 'LOC-NSW-SYDSOUTH' },
    ],
    {},
    'https://addressr.p.rapidapi.com/localities?q=syd',
  );

describe('LocalityAutocomplete', () => {
  it('renders combobox with accessible label', () => {
    const mockFetch = vi.fn();
    render(<LocalityAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Search Australian suburbs and towns')).toBeInTheDocument();
  });

  it('has name attribute defaulting to "locality"', () => {
    const mockFetch = vi.fn();
    render(<LocalityAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'locality');
  });

  it('sets aria-required when required is true', () => {
    const mockFetch = vi.fn();
    render(<LocalityAutocomplete apiKey="test" onSelect={() => {}} required fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-required', 'true');
  });

  it('has aria-atomic polite status live region', () => {
    const mockFetch = vi.fn();
    render(<LocalityAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('displays locality results after typing', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <LocalityAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'syd');

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
    expect(screen.getByText(/SYDNEY$/)).toBeInTheDocument();
    expect(screen.getAllByText(/NSW/).length).toBeGreaterThan(0);
  });

  it('calls onSelect with the LocalitySearchResult when option chosen', async () => {
    const onSelect = vi.fn();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <LocalityAutocomplete apiKey="test" onSelect={onSelect} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'syd');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    await userEvent.click(screen.getAllByRole('option')[0]);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'SYDNEY', postcode: '2000', pid: 'LOC-NSW-SYDNEY' }),
      );
    });
  });

  it('announces "Searching suburbs and towns..." while loading', async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockReturnValue(pending);

    render(
      <LocalityAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'syd');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Searching suburbs and towns...');
    });
    resolve(searchResponse());
  });

  it('announces count in status after results arrive', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <LocalityAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'syd');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('2 suburbs and towns found');
    });
  });

  it('uses custom renderLoading when provided', async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockReturnValue(pending);

    render(
      <LocalityAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderLoading={() => <li data-testid="custom-loading">Please wait...</li>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'syd');

    await waitFor(() => expect(screen.getByTestId('custom-loading')).toBeInTheDocument());
    resolve(searchResponse());
  });

  it('uses custom renderNoResults when provided', async () => {
    const empty = () => mockResponse([], {}, 'https://addressr.p.rapidapi.com/localities?q=zzz');
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(empty()));

    render(
      <LocalityAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderNoResults={() => <li data-testid="empty">Nothing</li>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'zzz');

    await waitFor(() => expect(screen.getByTestId('empty')).toBeInTheDocument());
  });

  it('uses custom renderItem when provided', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <LocalityAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderItem={(item) => <span data-testid={`item-${item.pid}`}>{item.name}</span>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'syd');

    await waitFor(() => expect(screen.getByTestId('item-LOC-NSW-SYDNEY')).toBeInTheDocument());
  });

  it('uses singular wording when exactly one result', async () => {
    const oneResult = () =>
      mockResponse(
        [{ name: 'SYDNEY', state: { name: 'New South Wales', abbreviation: 'NSW' }, postcode: '2000', score: 19, pid: 'LOC-1' }],
        {},
        'https://addressr.p.rapidapi.com/localities?q=sydney',
      );
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(oneResult()));

    render(
      <LocalityAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'sydney');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 suburb or town found');
    });
  });

  it('uses custom renderError when provided', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string | Request | URL) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (u.includes('?q=')) return Promise.reject(new Error('Boom'));
      return Promise.resolve(rootResponse());
    });

    render(
      <LocalityAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderError={(err) => <div data-testid="err" role="alert">{err.message}</div>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'syd');

    await waitFor(() => expect(screen.getByTestId('err')).toBeInTheDocument(), { timeout: 10000 });
  });
});
