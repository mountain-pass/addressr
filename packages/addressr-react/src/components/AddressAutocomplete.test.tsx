import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddressAutocomplete } from './AddressAutocomplete';

function mockResponse(body: unknown, headers: Record<string, string> = {}, url = '') {
  const resp = new Response(JSON.stringify(body), {
    status: 200,
    headers: new Headers(headers),
  });
  // Response.url is readonly, so we define it
  Object.defineProperty(resp, 'url', { value: url });
  return resp;
}

const rootResponse = () =>
  mockResponse(
    {},
    { link: '</addresses{?q}>; rel="https://addressr.io/rels/address-search"' },
    'https://addressr.p.rapidapi.com/',
  );

const searchResponse = (hasNext = false) =>
  mockResponse(
    [
      {
        sla: '1 GEORGE ST, SYDNEY NSW 2000',
        pid: 'GANSW123',
        score: 19,
        highlight: { sla: '<em>1</em> <em>GEORGE</em> ST, SYDNEY NSW 2000' },
      },
    ],
    hasNext
      ? {
          link: '</addresses/GANSW123>; rel=canonical; anchor="#/0", </addresses?q=1+george&p=2>; rel=next',
        }
      : { link: '</addresses/GANSW123>; rel=canonical; anchor="#/0"' },
    'https://addressr.p.rapidapi.com/addresses?q=1+george',
  );

const page2Response = () =>
  mockResponse(
    [
      {
        sla: '2 GEORGE ST, SYDNEY NSW 2000',
        pid: 'GANSW456',
        score: 18,
        highlight: { sla: '<em>2</em> <em>GEORGE</em> ST, SYDNEY NSW 2000' },
      },
    ],
    { link: '</addresses/GANSW456>; rel=canonical; anchor="#/0"' },
    'https://addressr.p.rapidapi.com/addresses?q=1+george&p=2',
  );

const detailResponse = () =>
  mockResponse(
    {
      pid: 'GANSW123',
      sla: '1 GEORGE ST, SYDNEY NSW 2000',
      mla: ['1 GEORGE ST', 'SYDNEY NSW 2000'],
      structured: {
        locality: { name: 'SYDNEY' },
        state: { name: 'NSW', abbreviation: 'NSW' },
        postcode: '2000',
        confidence: 2,
      },
    },
    {},
    'https://addressr.p.rapidapi.com/addresses/GANSW123',
  );

describe('AddressAutocomplete CSS tokens', () => {
  // @decision 002-css-custom-properties — all design tokens use var(--addressr-*)
  let css: string;

  beforeAll(async () => {
    const fs = await import('fs');
    const path = await import('path');
    css = fs.readFileSync(path.resolve(__dirname, './AddressAutocomplete.module.css'), 'utf-8');
  });

  it('uses CSS custom properties for all color values', () => {
    const lines = css.split('\n');
    const bareHexLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('//')) continue;
      if (/#[0-9a-fA-F]{3,8}\b/.test(trimmed) && !trimmed.includes('var(')) {
        bareHexLines.push(trimmed);
      }
    }
    expect(bareHexLines).toEqual([]);
  });

  it('uses CSS custom properties for font-family', () => {
    const lines = css.split('\n');
    const bareFontLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('font-family:') && !trimmed.includes('var(')) {
        bareFontLines.push(trimmed);
      }
    }
    expect(bareFontLines).toEqual([]);
  });

  it('uses CSS custom properties for box-shadow', () => {
    const lines = css.split('\n');
    const bareShadowLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('box-shadow:') && !trimmed.includes('var(') && trimmed !== 'box-shadow: none;') {
        bareShadowLines.push(trimmed);
      }
    }
    expect(bareShadowLines).toEqual([]);
  });

  it('uses CSS custom properties for z-index', () => {
    const lines = css.split('\n');
    const bareZLines: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('z-index:') && !trimmed.includes('var(')) {
        bareZLines.push(trimmed);
      }
    }
    expect(bareZLines).toEqual([]);
  });
});

describe('AddressAutocomplete', () => {
  it('renders with accessible label and combobox role', () => {
    const mockFetch = vi.fn();
    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Search Australian addresses')).toBeInTheDocument();
  });

  it('renders with custom label', () => {
    const mockFetch = vi.fn();
    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} label="Find your address" fetchImpl={mockFetch} />);
    expect(screen.getByText('Find your address')).toBeInTheDocument();
  });

  it('displays results after typing', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />);

    await userEvent.type(screen.getByRole('combobox'), '1 george');

    await waitFor(() => {
      expect(screen.getByRole('option')).toBeInTheDocument();
    });
  });

  it('renders highlights with mark elements', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />);

    await userEvent.type(screen.getByRole('combobox'), '1 george');

    await waitFor(() => {
      const marks = document.querySelectorAll('mark');
      expect(marks.length).toBeGreaterThan(0);
    });
  });

  it('calls onSelect when address is chosen', async () => {
    const onSelect = vi.fn();
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation((url: string | Request | URL) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        if (urlStr.includes('/addresses/')) {
          return Promise.resolve(detailResponse());
        }
        return Promise.resolve(searchResponse());
      });

    render(<AddressAutocomplete apiKey="test" onSelect={onSelect} debounceMs={10} fetchImpl={mockFetch} />);

    await userEvent.type(screen.getByRole('combobox'), '1 george');
    await waitFor(() => expect(screen.getByRole('option')).toBeInTheDocument());
    await userEvent.click(screen.getByRole('option'));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ pid: 'GANSW123' }));
    });
  });

  it('supports keyboard navigation while focus stays on the combobox', async () => {
    const onSelect = vi.fn();
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation((url: string | Request | URL) => {
        const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
        return Promise.resolve(urlStr.includes('/addresses/') ? detailResponse() : searchResponse());
      });

    render(<AddressAutocomplete apiKey="test" onSelect={onSelect} debounceMs={10} fetchImpl={mockFetch} />);

    const input = screen.getByRole('combobox');
    await userEvent.type(input, '1 george');
    let option = await screen.findByRole('option');

    await userEvent.keyboard('{ArrowDown}');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    expect(option).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Escape}');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input.getAttribute('aria-activedescendant') ?? '').toBe('');

    await userEvent.keyboard('{ArrowDown}');
    option = await screen.findByRole('option');
    expect(input).toHaveAttribute('aria-activedescendant', option.id);
    expect(option).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ pid: 'GANSW123' })));
    expect(input).toHaveFocus();
  });

  it('has screen reader status announcements', () => {
    const mockFetch = vi.fn();
    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has name attribute on input defaulting to "address"', () => {
    const mockFetch = vi.fn();
    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'address');
    expect(screen.getByRole('combobox')).toHaveAttribute('autocomplete', 'off');
  });

  it('accepts custom name attribute', () => {
    const mockFetch = vi.fn();
    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} name="shipping-address" fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'shipping-address');
  });

  it('uses native and visible required semantics when required', () => {
    const mockFetch = vi.fn();
    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} required fetchImpl={mockFetch} />);
    const input = screen.getByRole('combobox');
    expect(input).toBeRequired();
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('(required)')).toHaveAttribute('aria-hidden', 'true');
  });

  it('does not set aria-required by default', () => {
    const mockFetch = vi.fn();
    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-required');
  });

  it('has aria-atomic on status live region', () => {
    const mockFetch = vi.fn();
    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} fetchImpl={mockFetch} />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
  });

  it('sets aria-invalid when error occurs', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string | Request | URL) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('?q=')) {
        return Promise.reject(new Error('Server error'));
      }
      return Promise.resolve(rootResponse());
    });

    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />);

    await userEvent.type(screen.getByRole('combobox'), '1 george');

    await waitFor(
      () => {
        expect(screen.getByRole('combobox')).toHaveAttribute('aria-invalid', 'true');
      },
      { timeout: 10000 },
    );
  });

  it('shows skeleton loading instead of text', async () => {
    let resolveSearch: (value: Response) => void;
    const searchPromise = new Promise<Response>((resolve) => {
      resolveSearch = resolve;
    });

    const mockFetch = vi.fn().mockResolvedValueOnce(rootResponse()).mockReturnValue(searchPromise);

    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />);

    await userEvent.type(screen.getByRole('combobox'), '1 george');

    await waitFor(() => {
      const skeletons = document.querySelectorAll('[class*="skeleton"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(3);
      expect(screen.getByRole('status')).toHaveTextContent('Searching addresses...');
      expect(screen.getByRole('status')).not.toHaveTextContent('No addresses found');
      expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('Searching...')).not.toBeInTheDocument();
    resolveSearch!(searchResponse());
  });

  it('uses custom renderLoading when provided', async () => {
    let resolveSearch: (value: Response) => void;
    const searchPromise = new Promise<Response>((resolve) => {
      resolveSearch = resolve;
    });

    const mockFetch = vi.fn().mockResolvedValueOnce(rootResponse()).mockReturnValue(searchPromise);

    render(
      <AddressAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderLoading={() => <li data-testid="custom-loading">Please wait...</li>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), '1 george');

    await waitFor(() => {
      expect(screen.getByTestId('custom-loading')).toBeInTheDocument();
    });
    resolveSearch!(searchResponse());
  });

  it('uses custom renderNoResults when provided', async () => {
    const emptyResponse = () => mockResponse([], {}, 'https://addressr.p.rapidapi.com/addresses?q=zzz+nothing');

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(emptyResponse()));

    render(
      <AddressAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderNoResults={() => <li data-testid="custom-empty">Nothing here</li>}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), 'zzz nothing');

    await waitFor(() => {
      expect(screen.getByTestId('custom-empty')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('No addresses found');
    });
  });

  it('loads more results when scrolled near bottom', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse(true)));

    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />);

    await userEvent.type(screen.getByRole('combobox'), '1 george');
    await waitFor(() => expect(screen.getByRole('option')).toBeInTheDocument());

    // Now swap the mock to return page 2 for the next call
    mockFetch.mockImplementation(() => Promise.resolve(page2Response()));

    // Simulate scroll near bottom of the menu
    const menu = screen.getByRole('listbox');
    Object.defineProperties(menu, {
      scrollTop: { value: 100, writable: true },
      scrollHeight: { value: 150, writable: true },
      clientHeight: { value: 100, writable: true },
    });
    fireEvent.scroll(menu);

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
  });

  it('accepts renderError prop', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string | Request | URL) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('?q=')) {
        return Promise.reject(new Error('Server error'));
      }
      return Promise.resolve(rootResponse());
    });

    render(
      <AddressAutocomplete
        apiKey="test"
        onSelect={() => {}}
        debounceMs={10}
        fetchImpl={mockFetch}
        renderError={(err) => (
          <div data-testid="custom-error" role="alert">
            {err.message}
          </div>
        )}
      />,
    );

    await userEvent.type(screen.getByRole('combobox'), '1 george');

    await waitFor(
      () => {
        const input = screen.getByRole('combobox');
        const customError = screen.getByTestId('custom-error');
        const describedBy = input.getAttribute('aria-describedby');
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy!)).toContainElement(customError);
        expect(screen.getByRole('status')).not.toHaveTextContent('No addresses found');
      },
      { timeout: 10000 },
    );

    await userEvent.clear(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-invalid');
      expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-describedby');
    });
  });

  it('shows loading indicator while fetching more results', async () => {
    let resolvePage2: (value: Response) => void;
    const page2Promise = new Promise<Response>((resolve) => {
      resolvePage2 = resolve;
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse(true)));

    render(<AddressAutocomplete apiKey="test" onSelect={() => {}} debounceMs={10} fetchImpl={mockFetch} />);

    await userEvent.type(screen.getByRole('combobox'), '1 george');
    await waitFor(() => expect(screen.getByRole('option')).toBeInTheDocument());

    // Swap mock to return a delayed promise for the next page fetch
    mockFetch.mockReturnValue(page2Promise);

    // Trigger scroll
    const menu = screen.getByRole('listbox');
    Object.defineProperties(menu, {
      scrollTop: { value: 100, writable: true },
      scrollHeight: { value: 150, writable: true },
      clientHeight: { value: 100, writable: true },
    });
    fireEvent.scroll(menu);

    await waitFor(() => {
      expect(screen.getByText('Loading more...')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Loading more addresses...');
    });

    // Resolve the page 2 fetch
    resolvePage2!(page2Response());

    await waitFor(() => {
      expect(screen.queryByText('Loading more...')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('2 addresses found');
    });
  });
});
