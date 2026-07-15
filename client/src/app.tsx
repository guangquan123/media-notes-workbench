import React from 'react';
import { Route, Routes } from 'react-router-dom';

import Layout from './components/Layout';
import ArticleExportPage from './pages/ArticleExportPage/ArticleExportPage';
import AudioNotesPage from './pages/AudioNotesPage/AudioNotesPage';
import ConversionHistoryPage from './pages/ConversionHistoryPage/ConversionHistoryPage';
import EntryPage from './pages/EntryPage/EntryPage';
import LocalVideoNotesPage from './pages/LocalVideoNotesPage/LocalVideoNotesPage';
import NotFound from './pages/NotFound/NotFound';
import NoteTemplatesPage from './pages/NoteTemplatesPage/NoteTemplatesPage';
import PdfNotesPage from './pages/PdfNotesPage/PdfNotesPage';
import HomePage from './pages/HomePage/HomePage';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<EntryPage />} />
        <Route path="video-notes" element={<HomePage />} />
        <Route path="local-video-notes" element={<LocalVideoNotesPage />} />
        <Route path="audio-notes" element={<AudioNotesPage />} />
        <Route path="document-notes" element={<PdfNotesPage />} />
        <Route path="pdf-notes" element={<PdfNotesPage />} />
        <Route path="note-templates" element={<NoteTemplatesPage />} />
        <Route path="conversion-history" element={<ConversionHistoryPage />} />
        <Route path="article-export" element={<ArticleExportPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
