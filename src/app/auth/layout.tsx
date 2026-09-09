export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="min-h-screen bg-[#0e1117] font-sans text-white">{children}</div>;
}
