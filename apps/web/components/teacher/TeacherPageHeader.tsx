import type { ReactNode } from "react";

type TeacherPageHeaderProps = {
  title: string;
  description?: string;
  metadata?: string;
  action?: ReactNode;
};

export function TeacherPageHeader({
  title,
  description,
  metadata,
  action,
}: TeacherPageHeaderProps) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6">
        <div className="-ml-4 -mt-2 flex flex-wrap items-center justify-between sm:flex-nowrap">
          <div className="ml-4 mt-2 min-w-0">
            <h1 className="truncate text-base font-semibold text-gray-900">{title}</h1>
            {description ? <p className="mt-1 text-sm text-gray-600">{description}</p> : null}
            {metadata ? <p className="mt-1 text-xs text-gray-500">{metadata}</p> : null}
          </div>
          {action ? <div className="ml-4 mt-2 shrink-0">{action}</div> : null}
        </div>
      </div>
    </header>
  );
}
