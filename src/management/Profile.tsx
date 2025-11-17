'use client';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import DynamicForm from '@/dynamic-form/DynamicForm';
import log from '@/next-log/log';
import axios from 'axios';
import { deleteCookie, getCookie } from 'cookies-next';
import useSWR, { mutate } from 'swr';
import VerifySMS from '../mfa/SMS';
import { FormEvent, useEffect, useState } from 'react';
import { DataTable } from '../../../wais/data/data-table';
import { ColumnDef } from '@tanstack/react-table';
import { DataTableColumnHeader } from '../../../wais/data/data-table-column-header';
import { useRouter } from 'next/navigation';
import { DropdownMenu, DropdownMenuTrigger } from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { ArrowTopRightIcon } from '@radix-ui/react-icons';
import { InvitationsTable } from './Invitations';
import { useTeams } from '../hooks/useTeam';
import { toast } from '@/hooks/useToast';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

type Team = {
  image_url: string | null;
  name: string;
  parent_id: string | null;
  parent: string | null;
  children: any[]; // You can replace `any` with a more specific type if known
  updated_at: string; // ISO date string, you could also use `Date` if parsing
  updated_by_user_id: string | null;
  id: string;
  created_at: string;
  created_by_user_id: string;
  description: string | null;
  encryption_key: string;
  token: string | null;
  training_data: string | null;
};

export const Profile = ({
  isLoading,
  error,
  data,
  router,
  authConfig,
  userDataSWRKey,
  responseMessage,
  userUpdateEndpoint,
  setResponseMessage,
}: {
  isLoading: boolean;
  error: any;
  data: any;
  router: any;
  authConfig: any;
  userDataSWRKey: string;
  responseMessage: string;
  userUpdateEndpoint: string;
  setResponseMessage: (message: string) => void;
}) => {
  const { data: userTeams } = useTeams();
  // Use `data` passed from parent Manage component as the authoritative user object.
  // But be resilient to different API shapes. Try several common locations for fields.
  const readUserField = (field: string) => {
    // Try several common keys and shapes to be resilient to API variations.
    const candidates = [] as string[];
    const camel = field.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    candidates.push(field, camel, field.replace(/_/g, ''), field.replace('_name', ''), 'name');
    // Common identity keys
    if (field === 'first_name') candidates.push('given_name', 'givenName');
    if (field === 'last_name') candidates.push('family_name', 'familyName');
    if (field === 'display_name') candidates.push('displayName', 'username', 'userName');

    try {
      for (const key of candidates) {
        // check several nesting patterns
        if (data && data.user && data.user[key] !== undefined) return data.user[key];
        if (data && data[key] !== undefined) return data[key];
        if (data && data.user && data.user.user && data.user.user[key] !== undefined) return data.user.user[key];
        if (data && data.user && data.user.profile && data.user.profile[key] !== undefined) return data.user.profile[key];
      }
    } catch (e) {
      // ignore
    }
    return undefined;
  };

  // Debug: (removed runtime console output) - kept comment for dev reference

  // If the user has no timezone set on the server, detect the browser timezone and
  // persist it automatically on first sign-in so the UI and subsequent logins show
  // the correct timezone. Do NOT overwrite an existing timezone.
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return; // only client
      if (!data) return;
      const existingTZ = readUserField('timezone');
      if (existingTZ && String(existingTZ).length > 0) return; // already set, do nothing

      const detectedTZ =
        typeof Intl !== 'undefined' && Intl.DateTimeFormat ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

      // Persist the timezone so it becomes the user's saved preference.
      (async () => {
        try {
          await axios.put(
            `${authConfig.authServer}${userUpdateEndpoint}`,
            { user: { timezone: detectedTZ } },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${getCookie('jwt')}`,
              },
            },
          );
          // Refresh SWR cache
          await mutate(userDataSWRKey);
          await mutate('/user');
          // no need to notify the user explicitly here (silent default)
        } catch (err) {
          // failed to persist timezone; swallow silently (optionally investigate server logs)
        }
      })();
    } catch (err) {
      // swallow errors
    }
  }, [data, authConfig, userUpdateEndpoint, userDataSWRKey]);

  const user_teams_columns: ColumnDef<Team>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Team' />,
      cell: ({ row }) => {
        return (
          <div className='flex space-x-2'>
            <span className='max-w-[500px] truncate font-medium'>{row.getValue('name')}</span>
          </div>
        );
      },
      meta: {
        headerName: 'team',
      },
    },
    {
      accessorKey: 'role',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Role' />,
      cell: ({ row }) => {
        return (
          <div className='flex w-[100px] items-center'>
            <span>{row.getValue('role')}</span>
          </div>
        );
      },
      filterFn: (row, id, value) => {
        return value.includes(row.getValue(id));
      },
      meta: {
        headerName: 'role',
      },
    },
    {
      id: 'actions',
      header: ({ column }) => <DataTableColumnHeader column={column} title='Action' />,
      cell: ({ row }) => {
        const router = useRouter();

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant='ghost' className='flex h-8 w-8 p-0' onClick={() => router.push(`/team/${row?.original?.id}`)}>
                <ArrowTopRightIcon />
              </Button>
            </DropdownMenuTrigger>
          </DropdownMenu>
        );
      },
      enableHiding: true,
      enableSorting: false,
      meta: {
        headerName: 'Actions',
      },
    },
  ];

  return (
    <div>
      <div>
        <h3 className='text-2xl font-bold'>Profile</h3>
      </div>
      <Separator className='my-4' />
      {isLoading ? (
        <p>Loading Current Data...</p>
      ) : error ? (
        <p>{error.message}</p>
      ) : (data.missing_requirements && Object.keys(data.missing_requirements).length === 0) ||
        !data.missing_requirements ? (
        <DynamicForm
          fields={{
            first_name: {
              type: 'text',
              display: 'First Name',
              validation: (value: string) => value.length > 0,
              value: readUserField('first_name') ?? '',
              colSpan: 1,
              colSpanMd: 1,
              colSpanXl: 1,
              colStartXl: 1,
              rowStartMd: 1,
              rowStartXl: 1,
            },
            last_name: {
              type: 'text',
              display: 'Last Name',
              validation: (value: string) => value.length > 0,
              value: readUserField('last_name') ?? '',
              colSpan: 1,
              colSpanMd: 1,
              colSpanXl: 1,
              colStartXl: 1,
              rowStartMd: 2,
              rowStartXl: 2,
            },
            display_name: {
              type: 'text',
              display: 'Display Name',
              validation: (value: string) => value.length > 0,
              // Prefer explicit display_name, otherwise compose from first+last if available
              value:
                readUserField('display_name') ??
                (readUserField('first_name') || readUserField('last_name')
                  ? `${readUserField('first_name') ?? ''} ${readUserField('last_name') ?? ''}`.trim()
                  : ''),
              colSpan: 1,
              colSpanMd: 1,
              colSpanXl: 1,
              colStartXl: 1,
              rowStartMd: 3,
              rowStartXl: 3,
            },
            timezone: {
              type: 'text',
              display: 'Timezone',
              validation: (value: string) => value.length > 0,
              // Use server value if present; otherwise fall back to browser timezone or UTC.
              value:
                readUserField('timezone') && String(readUserField('timezone')).length > 0
                  ? String(readUserField('timezone'))
                  : typeof Intl !== 'undefined' && Intl.DateTimeFormat
                    ? Intl.DateTimeFormat().resolvedOptions().timeZone
                    : 'UTC',
              colSpan: 1,
              colSpanMd: 1,
              colSpanXl: 1,
              colStartXl: 2,
              rowStartMd: 1,
              rowStartXl: 1,
            },
          }}
          extraComponents={[
            {
              key: 'theme-toggle',
              element: <ThemeToggle initialTheme={readUserField('theme')} />,
              colSpan: 1,
              colStartMd: 2,
              colStartXl: 3,
              rowStartMd: 2,
              rowStartXl: 1,
            },
          ]}
          toUpdate={data.user}
          submitButtonText='Update'
          excludeFields={[
            'id',
            'agent_id',
            'missing_requirements',
            'email',
            'subscription',
            'stripe_id',
            'ip_address',
            'companies',
          ]}
          readOnlyFields={['input_tokens', 'output_tokens']}
          additionalButtons={[
            <div key='teams-table' className='col-span-full'>
              <DataTable data={userTeams || []} columns={user_teams_columns} meta={{ title: 'Teams' }} />
            </div>,
          ]}
          onConfirm={async (data) => {
            try {
              const updateResponse = (
                await axios
                  .put(
                    `${authConfig.authServer}${userUpdateEndpoint}`,
                    {
                      user: {
                        ...Object.entries(data).reduce((acc, [key, value]) => {
                          return value ? { ...acc, [key]: value } : acc;
                        }, {}),
                      },
                    },
                    {
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${getCookie('jwt')}`,
                      },
                    },
                  )
                  .catch((exception: any) => exception.response)
              ).data;
              log(['Update Response', updateResponse], { client: 2 });
              setResponseMessage(updateResponse.detail ? updateResponse.detail.toString() : 'Update successful.');
              await mutate('/user');
              toast({
                title: 'Profile updated',
                description: 'Your profile was updated successfully.',
              });
            } catch (err: any) {
              toast({
                title: 'Profile update failed',
                description: err?.message || 'There was an error updating your profile.',
                variant: 'destructive',
              });
            }
          }}
        />
      ) : (
        <>
          {data.missing_requirements.some((obj) => Object.keys(obj).some((key) => key === 'verify_email')) && (
            <p className='text-xl'>Please check your email and verify it using the link provided.</p>
          )}
          {data.missing_requirements.verify_sms && <VerifySMS verifiedCallback={async () => await mutate(userDataSWRKey)} />}
          {data.missing_requirements.some((obj) =>
            Object.keys(obj).some((key) => !['verify_email', 'verify_sms'].includes(key)),
          ) && (
            <DynamicForm
              submitButtonText='Submit Missing Information'
              fields={Object.entries(data.missing_requirements).reduce((acc, [key, value]) => {
                // @ts-expect-error This is a valid assignment.
                acc[Object.keys(value)[0]] = { type: Object.values(value)[0] };
                return acc;
              }, {})}
              excludeFields={['verify_email', 'verify_sms']}
              onConfirm={async (data) => {
                const updateResponse = (
                  await axios
                    .put(
                      `${authConfig.authServer}${userUpdateEndpoint}`,
                      {
                        ...data,
                      },
                      {
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${getCookie('jwt')}`,
                        },
                      },
                    )
                    .catch((exception: any) => exception.response)
                ).data;
                if (updateResponse.detail) {
                  setResponseMessage(updateResponse.detail.toString());
                }
                await mutate(userDataSWRKey);
                if (data.missing_requirements && Object.keys(data.missing_requirements).length === 0) {
                  const redirect = getCookie('href') ?? '/';
                  deleteCookie('href');
                  router.push(redirect);
                }
              }}
            />
          )}
          {responseMessage && <p>{responseMessage}</p>}
        </>
      )}
      <div className='pb-4' />
      {data?.user?.id && <InvitationsTable userId={data.user.id} />}
    </div>
  );
};
