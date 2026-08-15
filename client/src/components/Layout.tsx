import { Outlet } from 'react-router-dom';

const Layout = () => {
  return (
    <div className="min-h-screen w-full min-w-0 max-w-full">
      <Outlet />
    </div>
  );
};

export default Layout;
