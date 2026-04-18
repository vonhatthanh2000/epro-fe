import { createBrowserRouter } from 'react-router';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { ProfileSelectionPage } from './pages/ProfileSelectionPage';
import { EditProfilePage } from './pages/EditProfilePage';

export const router = createBrowserRouter([
  {
    path: '/',
    Component: LoginPage,
  },
  {
    path: '/profiles',
    Component: ProfileSelectionPage,
  },
  {
    path: '/profiles/:profileId',
    Component: EditProfilePage,
  },
  {
    path: '/home',
    Component: HomePage,
  },
]);
