"use client";

import { useState, useMemo } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  _count: { orders: number };
}

interface UsersTableProps {
  users: User[];
  currentUserId: string;
}

export function UsersTable({ users, currentUserId }: UsersTableProps) {
  const baseRoles = useMemo(
    () => Object.fromEntries(users.map((u) => [u.id, u.role])),
    [users]
  );
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const roles = { ...baseRoles, ...overrides };
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggleRole(userId: string) {
    const current = roles[userId];
    const next = current === "ADMIN" ? "CUSTOMER" : "ADMIN";
    setLoading(userId);
    setError(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: next }),
      });

      if (!res.ok) {
        let message = "Failed to update role";
        try {
          const data = await res.json();
          message = data.error ?? message;
        } catch {
          // body no es JSON (ej. 500 HTML) — usamos el mensaje por defecto
        }
        setError(message);
        return;
      }

      const { role: confirmedRole } = await res.json();
      setOverrides((prev) => ({ ...prev, [userId]: confirmedRole }));
    } catch {
      setError("Network error — please check your connection and try again");
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-[13px] text-red-700">
          {error}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-hag-border bg-hag-bg">
              <th className="text-left py-3 px-4 font-semibold text-hag-text-2">Name</th>
              <th className="text-left py-3 px-4 font-semibold text-hag-text-2">Email</th>
              <th className="text-left py-3 px-4 font-semibold text-hag-text-2">Role</th>
              <th className="text-left py-3 px-4 font-semibold text-hag-text-2">Orders</th>
              <th className="text-left py-3 px-4 font-semibold text-hag-text-2">Joined</th>
              <th className="text-left py-3 px-4 font-semibold text-hag-text-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const role = roles[user.id];
              const isSelf = user.id === currentUserId;
              return (
                <tr key={user.id} className="border-b border-hag-border hover:bg-hag-bg transition-colors">
                  <td className="py-3 px-4 font-medium text-hag-text">{user.name}</td>
                  <td className="py-3 px-4 text-hag-text-2">{user.email}</td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[12px] font-semibold ${
                        role === "ADMIN"
                          ? "bg-hag-accent text-white"
                          : "bg-hag-bg border border-hag-border text-hag-text-2"
                      }`}
                    >
                      {role}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-hag-text-2">{user._count.orders}</td>
                  <td className="py-3 px-4 text-hag-text-2">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4">
                    {isSelf ? (
                      <span className="text-[12px] text-hag-text-3">You</span>
                    ) : (
                      <button
                        onClick={() => toggleRole(user.id)}
                        disabled={loading === user.id}
                        className="px-3 py-1.5 rounded-lg border border-hag-border text-[12px] font-medium text-hag-text hover:bg-hag-bg-alt transition-colors disabled:opacity-50"
                      >
                        {loading === user.id
                          ? "Saving..."
                          : role === "ADMIN"
                          ? "Make Customer"
                          : "Make Admin"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
