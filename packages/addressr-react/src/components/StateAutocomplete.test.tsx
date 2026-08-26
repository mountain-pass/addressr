// @jtbd JTBD-004 (developer) + JTBD-103 (end-user)
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StateAutocomplete } from './StateAutocomplete';

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
    'https://addressr.p.rapidapi.com/states?q=n',
  );

describe('StateAutocomplete', () => {
  it('renders combobox with accessible label', () => {
    const mockFetch = vi.fn();
    render(<StateAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Search Australian states and territories')).toBeInTheDocument();
  });

  it('has name attribute defaulting to "state"', () => {
    const mockFetch = vi.fn();
    render(<StateAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'state');
  });

  it('sets aria-required when required is true', () => {
    const mockFetch = vi.fn();
    render(<StateAutocomplete apiKey="test" onSelect={() => {}} required fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-required', 'true');
  });

  it('has aria-atomic polite status live region', () => {
    const mockFetch = vi.fn();
    render(<StateAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('displays state results after typing', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <StateAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'nsw');

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
    expect(screen.getByText(/New South Wales/)).toBeInTheDocument();
    expect(screen.getByText(/NSW/)).toBeInTheDocument();
  });

  it('calls onSelect with the StateSearchResult when option chosen', async () => {
    const onSelect = vi.fn();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <StateAutocomplete apiKey="test" onSelect={onSelect} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'nsw');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    await userEvent.click(screen.getAllByRole('option')[0]);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New South Wales', abbreviation: 'NSW' }),
      );
    });
  });

  it('announces "Searching states and territories..." while loading', async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockReturnValue(pending);

    render(
      <StateAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'nsw');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Searching states and territories...');
    });
    resolve(searchResponse());
  });

  it('announces count in status after results arrive', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <StateAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'nsw');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('2 states or territories found');
    });
  });

  it('uses custom renderNoResults when provided', async () => {
    const empty = () => mockResponse([], {}, 'https://addressr.p.rapidapi.com/states?q=zzz');
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(empty()));

    render(
      <StateAutocomplete
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
      <StateAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderItem={(item) => <span data-testid={`item-${item.abbreviation}`}>{item.name}</span>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'nsw');

    await waitFor(() => expect(screen.getByTestId('item-NSW')).toBeInTheDocument());
  });

  it('uses singular wording when exactly one result', async () => {
    const oneResult = () =>
      mockResponse(
        [{ name: 'New South Wales', abbreviation: 'NSW' }],
        {},
        'https://addressr.p.rapidapi.com/states?q=nsw',
      );
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(oneResult()));

    render(
      <StateAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'nsw');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 state or territory found');
    });
  });

  it('matches results with a 2-letter abbreviation query (minQueryLength=2 default)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <StateAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'wa');

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
  });

  it('uses custom renderError when provided', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string | Request | URL) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (u.includes('?q=')) return Promise.reject(new Error('Boom'));
      return Promise.resolve(rootResponse());
    });

    render(
      <StateAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderError={(err) => <div data-testid="err" role="alert">{err.message}</div>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'nsw');

    await waitFor(() => expect(screen.getByTestId('err')).toBeInTheDocument(), { timeout: 10000 });
  });
});
