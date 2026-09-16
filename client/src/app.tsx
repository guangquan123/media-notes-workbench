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
import NoteTemplatesComparePage from './pages/NoteTemplatesComparePage/NoteTemplatesComparePage';
import OperationManualPage from './pages/OperationManualPage/OperationManualPage';
import PdfNotesPage from './pages/PdfNotesPage/PdfNotesPage';
import RecordingNotesPage from './pages/RecordingNotesPage/RecordingNotesPage';
import RecordingLibraryPage from './pages/RecordingLibraryPage/RecordingLibraryPage';
import RecordingPlayerPage from './pages/RecordingPlayerPage/RecordingPlayerPage';
import HomePage from './pages/HomePage/HomePage';
import PairedMediaNotesPage from './pages/PairedMediaNotesPage/PairedMediaNotesPage';
import AiModelSettingsPage from './pages/AiModelSettingsPage/AiModelSettingsPage';
import SettingsPage from './pages/SettingsPage/SettingsPage';
import SetupPage from './pages/SetupPage/SetupPage';
import CapabilityGate from './components/CapabilityGate';

const RoutesComponent = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<EntryPage />} />
        <Route path="setup" element={<SetupPage />} />
        <Route path="video-notes" element={<CapabilityGate capability="platform_video"><HomePage /></CapabilityGate>} />
        <Route path="local-video-notes" element={<CapabilityGate capability="local_video"><LocalVideoNotesPage /></CapabilityGate>} />
        <Route path="audio-notes" element={<CapabilityGate capability="local_audio"><AudioNotesPage /></CapabilityGate>} />
        <Route path="recording-notes" element={<CapabilityGate capability="recording"><RecordingNotesPage /></CapabilityGate>} />
        <Route path="recording-library" element={<RecordingLibraryPage />} />
        <Route path="recording-library/:id" element={<RecordingPlayerPage />} />
        <Route
          path="paired-media-notes"
          element={
            <CapabilityGate
              capability="local_video"
              featureName="双源会议 / 培训笔记"
            >
              <PairedMediaNotesPage />
            </CapabilityGate>
          }
        />
        <Route path="document-notes" element={<CapabilityGate capability="documents"><PdfNotesPage /></CapabilityGate>} />
        <Route path="pdf-notes" element={<CapabilityGate capability="documents"><PdfNotesPage /></CapabilityGate>} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="note-templates" element={<NoteTemplatesPage />} />
        <Route
          path="note-templates/compare"
          element={<NoteTemplatesComparePage />}
        />
        <Route
          path="transcription-settings"
          element={<AiModelSettingsPage initialTab="transcription" />}
        />
        <Route
          path="model-settings"
          element={<AiModelSettingsPage initialTab="models" />}
        />
        <Route path="ai-settings" element={<AiModelSettingsPage />} />
        <Route path="operation-manual" element={<OperationManualPage />} />
        <Route path="conversion-history" element={<ConversionHistoryPage />} />
        <Route path="article-export" element={<ArticleExportPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

export default RoutesComponent;
