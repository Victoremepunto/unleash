import { Suspense, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Error as LayoutError } from 'component/layout/Error/Error';
import { ConditionallyRender } from 'component/common/ConditionallyRender/ConditionallyRender';
import { FeedbackNPS } from 'component/feedback/FeedbackNPS/FeedbackNPS';
import { LayoutPicker } from 'component/layout/LayoutPicker/LayoutPicker';
import Loader from 'component/common/Loader/Loader';
import NotFound from 'component/common/NotFound/NotFound';
import { ProtectedRoute } from 'component/common/ProtectedRoute/ProtectedRoute';
import { SWRProvider } from 'component/providers/SWRProvider/SWRProvider';
import { PlausibleProvider } from 'component/providers/PlausibleProvider/PlausibleProvider';
import ToastRenderer from 'component/common/ToastRenderer/ToastRenderer';
import { routes } from 'component/menu/routes';
import { useAuthDetails } from 'hooks/api/getters/useAuth/useAuthDetails';
import { useAuthUser } from 'hooks/api/getters/useAuth/useAuthUser';
import { SplashPageRedirect } from 'component/splash/SplashPageRedirect/SplashPageRedirect';
import useUiConfig from 'hooks/api/getters/useUiConfig/useUiConfig';

import MaintenanceBanner from './maintenance/MaintenanceBanner';
import { styled } from '@mui/material';
import { InitialRedirect } from './InitialRedirect';
import { InternalBanners } from './banners/internalBanners/InternalBanners';
import { ExternalBanners } from './banners/externalBanners/ExternalBanners';

const StyledContainer = styled('div')(() => ({
    '& ul': {
        margin: 0,
    },
}));

export const App = () => {
    const { authDetails } = useAuthDetails();
    const { refetch: refetchUiConfig } = useUiConfig();

    const { user } = useAuthUser();
    const hasFetchedAuth = Boolean(authDetails || user);

    const { isOss, uiConfig } = useUiConfig();

    const availableRoutes = isOss()
        ? routes.filter((route) => !route.enterprise)
        : routes;

    useEffect(() => {
        if (hasFetchedAuth && Boolean(user?.id)) {
            refetchUiConfig();
        }
    }, [authDetails, user]);

    return (
        <ErrorBoundary FallbackComponent={LayoutError}>
            <PlausibleProvider>
                <ErrorBoundary FallbackComponent={LayoutError}>
                    <SWRProvider>
                        <Suspense fallback={<Loader />}>
                            <ConditionallyRender
                                condition={!hasFetchedAuth}
                                show={<Loader />}
                                elseShow={
                                    <>
                                        <ConditionallyRender
                                            condition={Boolean(
                                                uiConfig?.maintenanceMode,
                                            )}
                                            show={<MaintenanceBanner />}
                                        />
                                        <ExternalBanners />
                                        <InternalBanners />
                                        <StyledContainer>
                                            <ToastRenderer />
                                            <Routes>
                                                {availableRoutes.map(
                                                    (route) => (
                                                        <Route
                                                            key={route.path}
                                                            path={route.path}
                                                            element={
                                                                <LayoutPicker
                                                                    isStandalone={
                                                                        route.isStandalone ===
                                                                        true
                                                                    }
                                                                >
                                                                    <ProtectedRoute
                                                                        route={
                                                                            route
                                                                        }
                                                                    />
                                                                </LayoutPicker>
                                                            }
                                                        />
                                                    ),
                                                )}
                                                <Route
                                                    path='/'
                                                    element={
                                                        <InitialRedirect />
                                                    }
                                                />
                                                <Route
                                                    path='*'
                                                    element={<NotFound />}
                                                />
                                            </Routes>

                                            <FeedbackNPS openUrl='http://feedback.unleash.run' />

                                            <SplashPageRedirect />
                                        </StyledContainer>
                                    </>
                                }
                            />
                        </Suspense>
                    </SWRProvider>
                </ErrorBoundary>
            </PlausibleProvider>
        </ErrorBoundary>
    );
};
