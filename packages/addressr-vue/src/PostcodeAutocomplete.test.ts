// @jtbd JTBD-002 + JTBD-101
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/vue';
import userEvent from '@testing-library/user-event';
import PostcodeAutocomplete from './PostcodeAutocomplete.vue';

function mockResponse(body: unknown, headers: Record<string, string> = {}, url = '') {
  const resp = new Response(JSON.stringify(body), { status: 200, headers: new Headers(headers) });
  Object.defineProperty(resp, 'url', { value: url });
  return resp;
}

const rootResponse = () =>
  mockResponse(
    {},
    { link: '</postcodes{?q}>; rel="https://addressr.io/rels/postcode-search"' },
    'https://addressr.p.rapidapi.com/',
  );

const searchResponse = () =>
  mockResponse(
    [
      { postcode: '2000', localities: [{ name: 'SYDNEY' }] },
      { postcode: '2001', localities: [{ name: 'SYDNEY' }] },
    ],
    {},
    'https://addressr.p.rapidapi.com/postcodes?q=200',
  );

describe('PostcodeAutocomplete (Vue)', () => {
  it('renders combobox with accessible label', () => {
    const mockFetch = vi.fn();
    render(PostcodeAutocomplete, { props: { fetchImpl: mockFetch } });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Search Australian postcodes')).toBeInTheDocument();
  });

  it('has name attribute defaulting to "postcode"', () => {
    const mockFetch = vi.fn();
    render(PostcodeAutocomplete, { props: { fetchImpl: mockFetch } });
    expect(screen.getByRole('combobox')).toHaveAttribute('name', 'postcode');
  });

  it('has aria-atomic polite status live region', () => {
    const mockFetch = vi.fn();
    render(PostcodeAutocomplete, { props: { fetchImpl: mockFetch } });
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-atomic', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('sets aria-required when required prop is true', () => {
    const mockFetch = vi.fn();
    render(PostcodeAutocomplete, { props: { fetchImpl: mockFetch, required: true } });
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-required', 'true');
  });

  it('displays postcode results after typing', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(PostcodeAutocomplete, { props: { debounceMs: 10, fetchImpl: mockFetch } });

    await userEvent.type(screen.getByRole('combobox'), '200');

    await waitFor(() => {
      expect(screen.getAllByRole('option')).toHaveLength(2);
    });
  });

  it('emits select with PostcodeSearchResult when option chosen', async () => {
    const onSelect = vi.fn();
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(PostcodeAutocomplete, {
      props: { debounceMs: 10, fetchImpl: mockFetch, onSelect },
    });

    await userEvent.type(screen.getByRole('combobox'), '200');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    await userEvent.click(screen.getAllByRole('option')[0]);

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ postcode: '2000' }),
      );
    });
  });

  it('announces count in status live region', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(rootResponse())
      .mockImplementation(() => Promise.resolve(searchResponse()));

    render(PostcodeAutocomplete, { props: { debounceMs: 10, fetchImpl: mockFetch } });

    await userEvent.type(screen.getByRole('combobox'), '200');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('2 postcodes found');
    });
  });
});
