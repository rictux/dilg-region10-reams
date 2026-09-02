import React from 'react';
import { Lock } from 'lucide-react';

/** Shown only for users linked to a Supabase Auth account (auth_user_id is set). */
const AuthenticationBadge: React.FC<{ authUserId?: string | null }> = ({ authUserId }) => {
    if (authUserId == null) return null;

    return (
      <span
        className="inline-flex w-fit items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700"
        title="Linked to an authentication account"
      >
        <Lock size={10} aria-hidden="true" />
        Authenticated
      </span>
    );
};

export default AuthenticationBadge;
