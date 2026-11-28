'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = { initialUsername: string };

export default function ChesscomSettingsForm({ initialUsername }: Props) {
  const [username, setUsername] = useState(initialUsername);
  const [configuredUsername, setConfiguredUsername] = useState(initialUsername);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    setIsError(false);

    try {
      const response = await fetch('/api/settings/chesscom', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const result = (await response.json()) as {
        username?: string | null;
        error?: string;
      };

      if (!response.ok) {
        setIsError(true);
        setMessage(result.error ?? 'Could not save the Chess.com username.');
        return;
      }

      const savedUsername = result.username ?? '';
      setUsername(savedUsername);
      setConfiguredUsername(savedUsername);
      setMessage(
        savedUsername
          ? `Future imports will use ${savedUsername}. Existing imports keep their original source account.`
          : 'Chess.com username removed. Existing imports are unchanged.'
      );
    } catch {
      setIsError(true);
      setMessage(
        'Could not reach Lychee. Check your connection and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const removeSetting = async () => {
    setSaving(true);
    setMessage('');
    setIsError(false);
    try {
      const response = await fetch('/api/settings/chesscom', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: null }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        setIsError(true);
        setMessage(result.error ?? 'Could not remove the username.');
        return;
      }

      setUsername('');
      setConfiguredUsername('');
      setMessage('Chess.com username removed. Existing imports are unchanged.');
    } catch {
      setIsError(true);
      setMessage(
        'Could not reach Lychee. Check your connection and try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className='space-y-4 rounded-lg border p-6'>
      <div className='space-y-1'>
        <h2 className='text-xl font-semibold'>Chess.com account</h2>
        <p className='text-sm text-muted-foreground'>
          Lychee checks the public Chess.com profile only. This does not verify
          that you own the account. No Chess.com password or token is needed.
        </p>
      </div>
      <form className='space-y-3' onSubmit={submit}>
        <label
          className='block space-y-2 text-sm font-medium'
          htmlFor='username'
        >
          Public username
          <Input
            id='username'
            autoComplete='off'
            value={username}
            onChange={(event) => setUsername(event.currentTarget.value)}
            maxLength={25}
            aria-describedby='chesscom-setting-status'
            placeholder='Chess.com username'
          />
        </label>
        <div className='flex flex-wrap gap-2'>
          <Button type='submit' disabled={saving}>
            {saving ? 'Checking…' : 'Save and verify'}
          </Button>
          {configuredUsername && (
            <Button
              type='button'
              variant='outline'
              disabled={saving}
              onClick={removeSetting}
            >
              Remove setting
            </Button>
          )}
        </div>
      </form>
      <p
        id='chesscom-setting-status'
        role={message ? (isError ? 'alert' : 'status') : undefined}
        className={isError ? 'text-sm text-destructive' : 'text-sm'}
      >
        {message}
      </p>
      {configuredUsername && (
        <p className='text-sm text-muted-foreground'>
          Configured account: <strong>{configuredUsername}</strong>
        </p>
      )}
    </section>
  );
}
