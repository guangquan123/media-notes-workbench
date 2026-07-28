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
import OperationManualPage from './pages/OperationManualPage/OperationManualPage';
import PdfNotesPage from './pages/PdfNotesPage/PdfNotesPage';
import HomePage from './pages/HomePage/HomePage';
import NoteInboxPage from './pages/NoteInboxPage/NoteInboxPage';
import NoteInboxMessagesPage from './pages/NoteInboxMessagesPage/NoteInboxMessagesPage';
import PairedMediaNotesPage from './pages/PairedMediaNotesPage/PairedMediaNotesPage';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<EntryPage />} />
        <Route path="video-notes" element={<HomePage />} />
        <Route path="note-inbox" element={<NoteInboxPage />} />
        <Route path="note-inbox/messages" element={<NoteInboxMessagesPage />} />
        <Route path="local-video-notes" element={<LocalVideoNotesPage />} />
        <Route path="audio-notes" element={<AudioNotesPage />} />
        <Route path="paired-media-notes" element={<PairedMediaNotesPage />} />
        <Route path="document-notes" element={<PdfNotesPage />} />
        <Route path="pdf-notes" element={<PdfNotesPage />} />
        <Route path="note-templates" element={<NoteTemplatesPage />} />
        <Route path="operation-manual" element={<OperationManualPage />} />
        <Route path="conversion-history" element={<ConversionHistoryPage />} />
        <Route path="article-export" element={<ArticleExportPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
