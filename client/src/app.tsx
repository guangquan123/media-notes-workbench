import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import ArticleExportPage from './pages/ArticleExportPage/ArticleExportPage';
import NotFound from './pages/NotFound/NotFound';
import HomePage from './pages/HomePage/HomePage';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<ArticleExportPage />} />
        <Route path="video-notes" element={<HomePage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
