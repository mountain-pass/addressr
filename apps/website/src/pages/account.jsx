import {
  ClerkProvider,
  OrganizationSwitcher,
  SignInButton,
  UserButton,
  useAuth,
  useOrganization,
} from '@clerk/react';
import PropTypes from 'prop-types';
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Banner from '../components/Banner';
import Layout from '../components/layout';

const API_BASE = 'https://api.addressr.io/managed';

const Account = () => {
  const [config, setConfig] = useState();
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [checkoutNotice, setCheckoutNotice] = useState('');
  const [expectedOrganization, setExpectedOrganization] = useState('');
  const errorReference = useRef();

  useEffect(() => {
    if (['addressr.io', 'www.addressr.io'].includes(window.location.hostname)) {
      window.location.replace(
        `https://app.addressr.io/account/${window.location.search}`,
      );
      return;
    }

    const parameters = new URLSearchParams(window.location.search);
    const outcome = parameters.get('checkout');
    setExpectedOrganization(parameters.get('organization') || '');
    if (outcome === 'success') {
      setCheckoutNotice('Checkout completed. Your subscription is updating.');
    } else if (outcome === 'cancelled') {
      setCheckoutNotice('Checkout was cancelled. No plan change was made.');
    }

    const controller = new AbortController();
    const loadConfig = async () => {
      setStatus('Loading account configuration.');
      try {
        const response = await fetch(`${API_BASE}/config`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('managed_account_unavailable');
        const result = await response.json();
        setConfig(result);
        setStatus(
          result.available
            ? 'Account configuration loaded.'
            : 'Account management is not available yet.',
        );
      } catch (error_) {
        if (error_.name === 'AbortError') return;
        setError('Account management is unavailable. Try again later.');
        setStatus('Account configuration could not be loaded.');
      }
    };
    loadConfig();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (error) errorReference.current?.focus();
  }, [error]);

  return (
    <Layout>
      <Banner>
        <header className="major">
          <h1>Account and billing</h1>
        </header>
        <div className="content">
          <p>
            Manage your Addressr organisation, hosted API plan and API keys.
          </p>
        </div>
      </Banner>

      <div id="main" className="alt docs-page account-page">
        <section>
          <div className="inner">
            <p
              className="sr-only"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {status}
            </p>
            <p
              ref={errorReference}
              className="account-alert"
              role="alert"
              aria-atomic="true"
              tabIndex="-1"
            >
              {error}
            </p>
            <p
              className={checkoutNotice ? 'account-notice' : 'sr-only'}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {checkoutNotice}
            </p>
            {!config && !error && (
              <section aria-labelledby="account-loading-title">
                <header className="major">
                  <h2 id="account-loading-title">Account management</h2>
                </header>
                <p>Loading account management…</p>
              </section>
            )}
            {config && !config.available && (
              <section aria-labelledby="account-unavailable-title">
              <header className="major">
                <h2 id="account-unavailable-title">
                  Addressr accounts are not available yet
                </h2>
              </header>
              <p>
                Hosted plans remain available through RapidAPI while Addressr
                account management is being prepared.
              </p>
              <p>
                <a href="https://rapidapi.com/addressr-addressr-default/api/addressr/pricing">
                  Review Addressr plans on RapidAPI
                </a>
              </p>
            </section>
            )}
            {config?.available && (
              <ClerkProvider
                publishableKey={config.clerkPublishableKey}
                afterSignOutUrl="/account/"
              >
                <ManagedAccount
                  plans={config.plans}
                  expectedOrganization={expectedOrganization}
                  setError={setError}
                  setStatus={setStatus}
                />
              </ClerkProvider>
            )}
          </div>
        </section>
      </div>
    </Layout>
  );
};

const ManagedAccount = ({
  plans,
  expectedOrganization,
  setError,
  setStatus,
}) => {
  const { getToken, isLoaded, isSignedIn, orgId } = useAuth();
  const { organization } = useOrganization();
  const [account, setAccount] = useState();
  const [isBusy, setIsBusy] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [keyError, setKeyError] = useState('');
  const [newKey, setNewKey] = useState();
  const [revokeId, setRevokeId] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(plans[0]?.key || '');
  const keyNameReference = useRef();
  const newKeyReference = useRef();
  const confirmRevokeReference = useRef();
  const keysHeadingReference = useRef();

  const loadAccount = useCallback(async () => {
    if (!isLoaded || !isSignedIn || !orgId) return;
    if (expectedOrganization && orgId !== expectedOrganization) {
      setAccount(undefined);
      setError(
        'Choose the organisation that started this billing journey before continuing.',
      );
      setStatus('The active organisation does not match the billing return.');
      return;
    }
    setAccount(undefined);
    setNewKey(undefined);
    setError('');
    setStatus('Loading account details.');
    try {
      const result = await managedRequest('/account', getToken);
      setAccount(result);
      setStatus('Account details loaded.');
    } catch (error_) {
      setError(messageFor(error_));
      setStatus('Account details could not be loaded.');
    }
  }, [
    expectedOrganization,
    getToken,
    isLoaded,
    isSignedIn,
    orgId,
    setError,
    setStatus,
  ]);

  useEffect(() => {
    loadAccount();
  }, [loadAccount]);

  useEffect(() => {
    if (newKey) newKeyReference.current?.focus();
  }, [newKey]);

  useEffect(() => {
    if (revokeId) confirmRevokeReference.current?.focus();
  }, [revokeId]);

  if (!isLoaded) return <p>Loading sign-in…</p>;
  if (!isSignedIn) {
    return (
      <section aria-labelledby="sign-in-title">
        <header className="major">
          <h2 id="sign-in-title">Sign in to Addressr</h2>
        </header>
        <p>Sign in to manage your organisation, billing and API keys.</p>
        <SignInButton mode="redirect" forceRedirectUrl="/account/">
          <button type="button" className="button cta-primary">
            Sign in to Addressr
          </button>
        </SignInButton>
      </section>
    );
  }

  if (!orgId) {
    const afterSelection = expectedOrganization
      ? `/account/?organization=${encodeURIComponent(expectedOrganization)}`
      : '/account/';
    return (
      <section aria-labelledby="choose-organisation-title">
        <header className="major">
          <h2 id="choose-organisation-title">Choose an organisation</h2>
        </header>
        <p>Choose or create an organisation to manage billing and API keys.</p>
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl={afterSelection}
        />
      </section>
    );
  }

  if (expectedOrganization && orgId !== expectedOrganization) {
    return (
      <section aria-labelledby="billing-organisation-title">
        <header className="major">
          <h2 id="billing-organisation-title">Choose the billing organisation</h2>
        </header>
        <p>
          Choose the organisation that started this billing journey before
          continuing.
        </p>
        <OrganizationSwitcher
          hidePersonal
          afterSelectOrganizationUrl={`/account/?organization=${encodeURIComponent(expectedOrganization)}`}
        />
      </section>
    );
  }

  if (!account) return <p>Loading account details…</p>;

  const runBillingAction = async (path, openingMessage, options = {}) => {
    setIsBusy(true);
    setError('');
    setStatus(openingMessage);
    try {
      const result = await managedRequest(path, getToken, {
        method: 'POST',
        ...options,
      });
      const target = new URL(result.url);
      if (target.protocol !== 'https:') throw new Error('billing_unavailable');
      window.location.assign(target.href);
    } catch (error_) {
      setError(messageFor(error_));
      setStatus('Billing could not be opened.');
      setIsBusy(false);
    }
  };

  const createKey = async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    setIsBusy(true);
    setError('');
    setKeyError('');
    setStatus('Creating API key.');
    try {
      const result = await managedRequest('/api-keys', getToken, {
        method: 'POST',
        body: JSON.stringify({ name: keyName }),
      });
      setKeyName('');
      await loadAccount();
      setNewKey(result);
      setStatus('API key created. Copy it now; it will not be shown again.');
    } catch (error_) {
      const message = messageFor(error_);
      setKeyError(message);
      setStatus('API key could not be created.');
      keyNameReference.current?.focus();
    } finally {
      setIsBusy(false);
    }
  };

  const copyKey = async () => {
    try {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins -- this component runs in supported browsers, not Node.
      await window.navigator.clipboard.writeText(newKey.key);
      setStatus('API key copied.');
    } catch {
      setError('Copy failed. Select and copy the key manually.');
      setStatus('API key was not copied.');
    }
  };

  const cancelRevoke = (id) => {
    setRevokeId('');
    requestAnimationFrame(() =>
      document.getElementById(`revoke-${id}`)?.focus(),
    );
  };

  const revokeKey = async (key) => {
    setIsBusy(true);
    setError('');
    setStatus(`Revoking ${key.name} key.`);
    try {
      await managedRequest(`/api-keys/${key.id}`, getToken, {
        method: 'DELETE',
      });
      setRevokeId('');
      await loadAccount();
      setStatus(`${key.name} key revoked.`);
      requestAnimationFrame(() => keysHeadingReference.current?.focus());
    } catch (error_) {
      setError(messageFor(error_));
      setStatus('API key could not be revoked.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div aria-busy={isBusy ? 'true' : 'false'}>
      {isBusy && <p>Working…</p>}
      <section aria-labelledby="identity-title">
        <header className="major">
          <h2 id="identity-title">Identity and organisation</h2>
        </header>
        <p>
          Current organisation:{' '}
          <strong>{organization?.name || account.organization.clerkId}</strong>
        </p>
        <div className="account-identity-actions">
          <OrganizationSwitcher hidePersonal afterSelectOrganizationUrl="/account/" />
          <UserButton afterSignOutUrl="/account/" />
        </div>
        {!account.organization.canManage && (
          <p>Only organisation admins can manage billing and API keys.</p>
        )}
      </section>

      <section aria-labelledby="subscription-title">
        <header className="major">
          <h2 id="subscription-title">Subscription and request quota</h2>
        </header>
        {account.subscription ? (
          <dl className="account-summary">
            <div>
              <dt>Plan</dt>
              <dd>{account.subscription.plan}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{account.subscription.status}</dd>
            </div>
            {account.quota && (
              <div>
                <dt>Requests this period</dt>
                <dd>
                  {account.quota.used.toLocaleString()} of{' '}
                  {account.quota.limit.toLocaleString()}
                  <progress
                    aria-label="Requests used this period"
                    value={account.quota.used}
                    max={account.quota.limit}
                  />
                </dd>
              </div>
            )}
          </dl>
        ) : (
          <p>This organisation does not have an Addressr-managed plan.</p>
        )}
      </section>

      <section aria-labelledby="billing-title">
        <header className="major">
          <h2 id="billing-title">Billing</h2>
        </header>
        {account.organization.canManage && !account.subscription && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              runBillingAction(
                '/checkout',
                'Opening Stripe Checkout.',
                { body: JSON.stringify({ plan: selectedPlan }) },
              );
            }}
          >
            <label htmlFor="account-plan">Hosted API plan</label>
            <select
              id="account-plan"
              value={selectedPlan}
              onChange={(event) => setSelectedPlan(event.target.value)}
              required
            >
              {plans.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name}
                </option>
              ))}
            </select>
            <button type="submit" className="button cta-primary" disabled={isBusy}>
              Choose {plans.find((plan) => plan.key === selectedPlan)?.name || 'plan'}
            </button>
          </form>
        )}
        {account.organization.canManage && account.subscription && (
          <button
            type="button"
            className="button"
            disabled={isBusy}
            onClick={() =>
              runBillingAction('/portal', 'Opening Stripe billing portal.')
            }
          >
            Manage billing in Stripe
          </button>
        )}
        {!account.organization.canManage && (
          <p>Ask an organisation admin to manage the plan and billing.</p>
        )}
      </section>

      <section aria-labelledby="api-keys-title">
        <header className="major">
          <h2 id="api-keys-title" ref={keysHeadingReference} tabIndex="-1">
            API keys
          </h2>
        </header>
        {account.organization.canManage && (
          <form className="account-key-form" onSubmit={createKey} noValidate>
            <label htmlFor="api-key-name">Key name</label>
            <p id="api-key-name-help">
              Use a name that identifies where the key will be used.
            </p>
            <input
              ref={keyNameReference}
              id="api-key-name"
              name="api-key-name"
              value={keyName}
              onChange={(event) => setKeyName(event.target.value)}
              aria-describedby={`api-key-name-help${keyError ? ' api-key-name-error' : ''}`}
              aria-invalid={keyError ? 'true' : undefined}
              maxLength="64"
              required
            />
            <p id="api-key-name-error" className="account-field-error">
              {keyError}
            </p>
            <button type="submit" className="button" disabled={isBusy}>
              Create API key
            </button>
          </form>
        )}

        {newKey && (
          <div className="account-new-key">
            <h3 ref={newKeyReference} tabIndex="-1">
              Copy this API key now
            </h3>
            <p>
              <strong>Copy this key now.</strong> It will not be shown again.
            </p>
            <label htmlFor="new-api-key">New API key</label>
            <input id="new-api-key" value={newKey.key} readOnly />
            <button type="button" className="button" onClick={copyKey}>
              Copy new API key
            </button>
          </div>
        )}

        {account.keys.length === 0 ? (
          <p>No API keys have been created for this organisation.</p>
        ) : (
          <ul className="account-key-list">
            {account.keys.map((key) => (
              <li key={key.id}>
                <h3>{key.name}</h3>
                <dl>
                  <div>
                    <dt>Prefix</dt>
                    <dd>
                      <code>{key.prefix}</code>
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{key.revokedAt ? 'Revoked' : 'Active'}</dd>
                  </div>
                </dl>
                {account.organization.canManage && !key.revokedAt && (
                  <>
                    <button
                      id={`revoke-${key.id}`}
                      type="button"
                      className="button"
                      aria-expanded={revokeId === key.id}
                      aria-controls={`revoke-confirm-${key.id}`}
                      onClick={() => setRevokeId(key.id)}
                    >
                      Revoke {key.name} key
                    </button>
                    <div
                      id={`revoke-confirm-${key.id}`}
                      className="account-revoke-confirmation"
                      hidden={revokeId !== key.id}
                    >
                      <p>Requests using this key will stop immediately.</p>
                      <button
                        ref={
                          revokeId === key.id
                            ? confirmRevokeReference
                            : undefined
                        }
                        type="button"
                        className="button"
                        disabled={isBusy}
                        onClick={() => revokeKey(key)}
                      >
                        Confirm revoke {key.name} key
                      </button>
                      <button
                        type="button"
                        className="button"
                        disabled={isBusy}
                        onClick={() => cancelRevoke(key.id)}
                      >
                        Cancel revoke {key.name} key
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

async function managedRequest(path, getToken, options = {}) {
  const token = await getToken();
  if (!token) throw new Error('sign_in_required');
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!response.ok) throw new Error(body?.error || 'managed_account_unavailable');
  return body;
}

function messageFor(error) {
  const messages = {
    active_organization_required:
      'Choose or create an organisation to manage billing and API keys.',
    api_key_not_found: 'That API key was already revoked or could not be found.',
    billing_unavailable: 'Billing is unavailable. Try again later.',
    checkout_pending:
      'A checkout is already open for this organisation. Finish it or try another plan in about 30 minutes.',
    invalid_key_name:
      'Enter a key name using letters, numbers, spaces, dots, underscores, hyphens or apostrophes.',
    invalid_session: 'Sign in again to manage your Addressr account.',
    key_name_exists: 'An API key already uses that name.',
    managed_account_unavailable:
      'Account management is unavailable. Try again later.',
    organization_admin_required:
      'Only organisation admins can manage billing and API keys.',
    sign_in_required: 'Sign in to manage your Addressr account.',
    subscription_exists: 'This organisation already has an active subscription.',
  };
  return messages[error?.message] || 'Something went wrong. Try again later.';
}

ManagedAccount.propTypes = {
  expectedOrganization: PropTypes.string.isRequired,
  plans: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      name: PropTypes.string.isRequired,
    }),
  ).isRequired,
  setError: PropTypes.func.isRequired,
  setStatus: PropTypes.func.isRequired,
};

export const Head = () => (
  <>
    <title>Account and billing - Addressr</title>
    <meta
      name="description"
      content="Manage your Addressr hosted API organisation, billing and API keys."
    />
    <link rel="canonical" href="https://app.addressr.io/account/" />
  </>
);

export default Account;
