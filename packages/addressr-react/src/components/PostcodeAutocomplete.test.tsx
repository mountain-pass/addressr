// @jtbd JTBD-002 (developer) + JTBD-101 (end-user)
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PostcodeAutocomplete } from './PostcodeAutocomplete';

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
    { link: '</postcodes{?q}>; rel="https://addressr.io/rels/postcode-search"' },
    'https://addressr.p.rapidapi.com/',
  );

const searchResponse = (hasNext = false) =>
  mockResponse(
    [
      { postcode: '2000', localities: [{ name: 'SYDNEY' }, { name: 'BARANGAROO' }] },
      { postcode: '2001', localities: [{ name: 'SYDNEY' }] },
    ],
    hasNext
      ? { link: '</postcodes?q=20&p=2>; rel=next' }
      : {},
    'https://addressr.p.rapidapi.com/postcodes?q=20',
  );

describe('PostcodeAutocomplete', () => {
  it('renders combobox with accessible label', () => {
    const mockFetch = vi.fn();
    render(<PostcodeAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Search Australian postcodes')).toBeInTheDocument();
  });

  it('renders with custom label and placeholder', () => {
    const mockFetch = vi.fn();
    render(
      <PostcodeAutocomplete
        apiKey="test"
        onSelect={() => {}}
        label="Find postcode"
        placeholder="e.g. 2000"
        fetchImpl={mockFetch}
      />,
    );
    expect(screen.getByText('Find postcode')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. 2000')).toBeInTheDocument();
  });

  it('has name attribute defaulting to "postcode"', () => {
    const mockFetch = vi.fn();
    render(<PostcodeAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'postcode');
  });

  it('accepts custom name attribute', () => {
    const mockFetch = vi.fn();
    render(
      <PostcodeAutocomplete apiKey="test" onSelect={() => {}} name="billing-postcode" fetchImpl={mockFetch} />,
    );
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'billing-postcode');
  });

  it('sets aria-required when required is true', () => {
    const mockFetch = vi.fn();
    render(<PostcodeAutocomplete apiKey="test" onSelect={() => {}} required fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-required', 'true');
  });

  it('has aria-atomic polite status live region', () => {
    const mockFetch = vi.fn();
    render(<PostcodeAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('displays postcode results after typing', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <PostcodeAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), '200');

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
    expect(screen.getByText(/2000/)).toBeInTheDocument();
    expect(screen.getAllByText(/SYDNEY/).length).toBeGreaterThan(0);
  });

  it('calls onSelect with the PostcodeSearchResult when option chosen', async () => {
    const onSelect = vi.fn();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <PostcodeAutocomplete apiKey="test" onSelect={onSelect} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), '200');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    await userEvent.click(screen.getAllByRole('option')[0]);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ postcode: '2000' }),
      );
    });
  });

  it('announces "Searching postcodes..." while loading', async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockReturnValue(pending);

    render(
      <PostcodeAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), '200');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Searching postcodes...');
    });
    resolve(searchResponse());
  });

  it('announces count in status after results arrive', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(
      <PostcodeAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), '200');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('2 postcodes found');
    });
  });

  it('uses custom renderLoading when provided', async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockReturnValue(pending);

    render(
      <PostcodeAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderLoading={() => <li data-testid="custom-loading">Please wait...</li>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), '200');

    await waitFor(() => expect(screen.getByTestId('custom-loading')).toBeInTheDocument());
    resolve(searchResponse());
  });

  it('uses custom renderNoResults when provided', async () => {
    const empty = () => mockResponse([], {}, 'https://addressr.p.rapidapi.com/postcodes?q=zzz');
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(empty()));

    render(
      <PostcodeAutocomplete
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
      <PostcodeAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderItem={(item) => <span data-testid={`item-${item.postcode}`}>{item.postcode}</span>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), '200');

    await waitFor(() => expect(screen.getByTestId('item-2000')).toBeInTheDocument());
    expect(screen.getByTestId('item-2001')).toBeInTheDocument();
  });

  it('uses custom renderError when provided', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string | Request | URL) => {
      const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (u.includes('?q=')) return Promise.reject(new Error('Boom'));
      return Promise.resolve(rootResponse());
    });

    render(
      <PostcodeAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderError={(err) => <div data-testid="err" role="alert">{err.message}</div>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), '200');

    await waitFor(() => expect(screen.getByTestId('err')).toBeInTheDocument(), { timeout: 10000 });
  });

  it('uses singular wording when exactly one result', async () => {
    const oneResult = () =>
      mockResponse(
        [{ postcode: '2000', localities: [{ name: 'SYDNEY' }] }],
        {},
        'https://addressr.p.rapidapi.com/postcodes?q=2000',
      );
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(oneResult()));

    render(
      <PostcodeAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), '2000');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('1 postcode found');
    });
  });

  it('renders both rows when two postcodes share the same value (composite key)', async () => {
    const dupResponse = () =>
      mockResponse(
        [
          { postcode: '2620', localities: [{ name: 'QUEANBEYAN' }] },
          { postcode: '2620', localities: [{ name: 'JERRABOMBERRA' }] },
        ],
        {},
        'https://addressr.p.rapidapi.com/postcodes?q=2620',
      );
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(dupResponse()));

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <PostcodeAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), '262');

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    const keyWarning = errorSpy.mock.calls.find((c) =>
      String(c[0]).includes('the same key'),
    );
    expect(keyWarning).toBeUndefined();

    errorSpy.mockRestore();
  });

  it('shows skeleton loading instead of text by default', async () => {
    let resolve!: (r: Response) => void;
    const pending = new Promise<Response>((r) => { resolve = r; });

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockReturnValue(pending);

    render(
      <PostcodeAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />,
    );

    await userEvent.type(screen.getByRole('combobox'), '200');

    await waitFor(() => {
      const skeletons = document.querySelectorAll('[class*="skeleton"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
    });
    resolve(searchResponse());
  });
});
