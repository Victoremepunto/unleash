import React, { useEffect, useState } from 'react';
import useProject, {
    useProjectNameOrId,
} from 'hooks/api/getters/useProject/useProject';
import { Box, styled } from '@mui/material';
import { ProjectFeatureToggles } from '../ProjectFeatureToggles/ProjectFeatureToggles';
import { usePageTitle } from 'hooks/usePageTitle';
import { useRequiredPathParam } from 'hooks/useRequiredPathParam';
import { useLastViewedProject } from 'hooks/useLastViewedProject';

import { useUiFlag } from 'hooks/useUiFlag';
import { useFeatureSearch } from 'hooks/api/getters/useFeatureSearch/useFeatureSearch';
import {
    ISortingRules,
    PaginatedProjectFeatureToggles,
} from '../ProjectFeatureToggles/PaginatedProjectFeatureToggles';
import { useSearchParams } from 'react-router-dom';

import { PaginationBar } from 'component/common/PaginationBar/PaginationBar';
import { SortingRule } from 'react-table';

const refreshInterval = 15 * 1000;

const StyledContainer = styled('div')(({ theme }) => ({
    display: 'flex',
    [theme.breakpoints.down('md')]: {
        flexDirection: 'column',
    },
}));

const StyledProjectToggles = styled('div')(() => ({
    width: '100%',
    minWidth: 0,
}));

const StyledContentContainer = styled(Box)(() => ({
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minWidth: 0,
}));

export const DEFAULT_PAGE_LIMIT = 25;

const PaginatedProjectOverview = () => {
    const projectId = useRequiredPathParam('projectId');
    const [searchParams, setSearchParams] = useSearchParams();
    const { project, loading: projectLoading } = useProject(projectId, {
        refreshInterval,
    });
    const [pageLimit, setPageLimit] = useState(DEFAULT_PAGE_LIMIT);
    const [currentOffset, setCurrentOffset] = useState(0);

    const [searchValue, setSearchValue] = useState(
        searchParams.get('search') || '',
    );

    const [sortingRules, setSortingRules] = useState<ISortingRules>({
        sortBy: 'createdBy',
        sortOrder: 'desc',
        isFavoritesPinned: false,
    });

    const {
        features: searchFeatures,
        total,
        refetch,
        loading,
        initialLoad,
    } = useFeatureSearch(
        currentOffset,
        pageLimit,
        sortingRules,
        projectId,
        searchValue,
        {
            refreshInterval,
        },
    );

    const { environments } = project;
    const fetchNextPage = () => {
        if (!loading) {
            setCurrentOffset(Math.min(total, currentOffset + pageLimit));
        }
    };
    const fetchPrevPage = () => {
        setCurrentOffset(Math.max(0, currentOffset - pageLimit));
    };

    const hasPreviousPage = currentOffset > 0;
    const hasNextPage = currentOffset + pageLimit < total;

    return (
        <StyledContainer>
            <StyledContentContainer>
                <StyledProjectToggles>
                    <PaginatedProjectFeatureToggles
                        key={
                            loading && searchFeatures.length === 0
                                ? 'loading'
                                : 'ready'
                        }
                        features={searchFeatures}
                        style={{ width: '100%', margin: 0 }}
                        environments={environments}
                        initialLoad={initialLoad && searchFeatures.length === 0}
                        loading={loading && searchFeatures.length === 0}
                        onChange={refetch}
                        total={total}
                        searchValue={searchValue}
                        setSearchValue={setSearchValue}
                        sortingRules={sortingRules}
                        setSortingRules={setSortingRules}
                        paginationBar={
                            <StickyPaginationBar>
                                <PaginationBar
                                    total={total}
                                    hasNextPage={hasNextPage}
                                    hasPreviousPage={hasPreviousPage}
                                    fetchNextPage={fetchNextPage}
                                    fetchPrevPage={fetchPrevPage}
                                    currentOffset={currentOffset}
                                    pageLimit={pageLimit}
                                    setPageLimit={setPageLimit}
                                />
                            </StickyPaginationBar>
                        }
                    />
                </StyledProjectToggles>
            </StyledContentContainer>
        </StyledContainer>
    );
};

const StyledStickyBar = styled('div')(({ theme }) => ({
    position: 'sticky',
    bottom: 0,
    backgroundColor: theme.palette.background.paper,
    padding: theme.spacing(2),
    zIndex: 9999,
    borderBottomLeftRadius: theme.shape.borderRadiusMedium,
    borderBottomRightRadius: theme.shape.borderRadiusMedium,
    borderTop: `1px solid ${theme.palette.divider}`,
    boxShadow: `0px -2px 8px 0px rgba(32, 32, 33, 0.06)`,
    height: '52px',
}));

const StyledStickyBarContentContainer = styled(Box)(({ theme }) => ({
    display: 'flex',
    justifyContent: 'space-between',
    width: '100%',
    minWidth: 0,
}));

const StickyPaginationBar: React.FC = ({ children }) => {
    return (
        <StyledStickyBar>
            <StyledStickyBarContentContainer>
                {children}
            </StyledStickyBarContentContainer>
        </StyledStickyBar>
    );
};

/**
 * @deprecated remove when flag `featureSearchFrontend` is removed
 */
export const ExperimentalProjectFeatures = () => {
    const projectId = useRequiredPathParam('projectId');
    const projectName = useProjectNameOrId(projectId);
    const { project, loading, refetch } = useProject(projectId, {
        refreshInterval,
    });
    const { features, environments } = project;
    usePageTitle(`Project overview – ${projectName}`);
    const { setLastViewed } = useLastViewedProject();
    const featureSearchFrontend = useUiFlag('featureSearchFrontend');

    useEffect(() => {
        setLastViewed(projectId);
    }, [projectId, setLastViewed]);

    if (featureSearchFrontend) return <PaginatedProjectOverview />;

    return (
        <StyledContainer>
            <StyledContentContainer>
                <StyledProjectToggles>
                    <ProjectFeatureToggles
                        style={{ width: '100%', margin: 0 }}
                        key={loading ? 'loading' : 'ready'}
                        features={features}
                        environments={environments}
                        loading={loading}
                        onChange={refetch}
                    />
                </StyledProjectToggles>
            </StyledContentContainer>
        </StyledContainer>
    );
};
