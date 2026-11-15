import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchHealth } from '../services/api';
import { Database, Server, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';

export const HomePage: React.FC = () => {
  const {
    data: health,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['system-health'],
    queryFn: fetchHealth,
    refetchInterval: 10000,
  });

  return (
    <div className="space-y-6">
      {/* Hero Overview */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              MedCoreHMS Foundation Shell
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Unified React 19 + Express MERN Architecture Foundation (Phase 0 – Day 3)
            </p>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center px-4 py-2 border border-slate-300 rounded-lg shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh Health
          </button>
        </div>
      </div>

      {/* Health Diagnostics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Express Server Card */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Application API
              </span>
              <Server className="h-5 w-5 text-teal-600" />
            </div>
            <div className="mt-3 flex items-center space-x-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-lg font-semibold text-slate-800">
                {isLoading ? 'Checking...' : isError ? 'Unreachable' : 'Operational'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Express TypeScript backend serving `/api` endpoints and static assets.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
            Environment:{' '}
            <span className="font-mono text-slate-600">
              {health?.environment || 'detecting...'}
            </span>
          </div>
        </div>

        {/* Database Diagnostic Card */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                MongoDB Status
              </span>
              <Database className="h-5 w-5 text-indigo-600" />
            </div>
            <div className="mt-3 flex items-center space-x-2">
              {health?.database.status === 'connected' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  <span className="text-lg font-semibold text-slate-800">Connected</span>
                </>
              ) : (
                <>
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <span className="text-lg font-semibold text-slate-800 capitalize">
                    {health?.database.status || 'Disconnected'}
                  </span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Mongoose multi-tenant data layer. Truthful real-time readyState inspection.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
            ReadyState:{' '}
            <span className="font-mono text-slate-600">
              {health?.database.readyState ?? '0 (Offline)'}
            </span>
          </div>
        </div>

        {/* Architecture Specs Card */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Deployment Target
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-100 text-slate-700">
                Render Web Service
              </span>
            </div>
            <div className="mt-3">
              <span className="text-lg font-semibold text-slate-800">Unified Single Service</span>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Single root project, single port (`PORT`), zero client/server project fragmentation.
            </p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-400">
            Frontend: React 19 + Vite | Backend: Express TS
          </div>
        </div>
      </div>

      {/* Diagnostics / Error details if API unreachable */}
      {isError && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-sm">
          <div className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> API Service Warning
          </div>
          <p className="mt-1 text-xs">
            Backend API at <code className="font-mono bg-amber-100 px-1 rounded">/api/health</code>{' '}
            is not responding. Ensure the backend server is running via{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">npm run dev</code> or{' '}
            <code className="font-mono bg-amber-100 px-1 rounded">npm start</code>. Error:{' '}
            {(error as Error)?.message}
          </p>
        </div>
      )}
    </div>
  );
};
