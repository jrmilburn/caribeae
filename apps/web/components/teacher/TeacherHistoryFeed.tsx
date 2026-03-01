import Link from "next/link";
import { format } from "date-fns";
import { CheckIcon, HandThumbUpIcon, UserIcon } from "@heroicons/react/20/solid";

import type { TeacherStudentHistoryItem } from "@/server/teacher/getTeacherStudentDetails";

function classNames(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function feedIcon(kind: TeacherStudentHistoryItem["kind"]) {
  switch (kind) {
    case "SKILL":
      return {
        icon: CheckIcon,
        iconBackground: "bg-green-500",
      };
    case "ATTENDANCE":
      return {
        icon: HandThumbUpIcon,
        iconBackground: "bg-blue-500",
      };
    case "ENROLMENT":
      return {
        icon: UserIcon,
        iconBackground: "bg-gray-400",
      };
    default:
      return {
        icon: UserIcon,
        iconBackground: "bg-gray-400",
      };
  }
}

export function TeacherHistoryFeed({ items }: { items: TeacherStudentHistoryItem[] }) {
  if (!items.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-6 text-sm text-gray-500">
        No history yet.
      </div>
    );
  }

  return (
    <div className="flow-root">
      <ul role="list" className="-mb-8">
        {items.map((item, itemIdx) => {
          const iconConfig = feedIcon(item.kind);
          const Icon = iconConfig.icon;

          return (
            <li key={item.id}>
              <div className="relative pb-8">
                {itemIdx !== items.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200"
                  />
                ) : null}
                <div className="relative flex space-x-3">
                  <div>
                    <span
                      className={classNames(
                        iconConfig.iconBackground,
                        "flex size-8 items-center justify-center rounded-full ring-8 ring-white"
                      )}
                    >
                      <Icon aria-hidden="true" className="size-5 text-white" />
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                    <div>
                      <p className="text-sm text-gray-600">
                        {item.href ? (
                          <Link href={item.href} className="font-medium text-gray-900 hover:underline">
                            {item.title}
                          </Link>
                        ) : (
                          <span className="font-medium text-gray-900">{item.title}</span>
                        )}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">{item.description}</p>
                    </div>
                    <div className="whitespace-nowrap text-right text-xs text-gray-500">
                      <time dateTime={item.occurredAt.toISOString()}>
                        {format(item.occurredAt, "d MMM yyyy")}
                      </time>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
