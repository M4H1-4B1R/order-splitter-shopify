import { Page, Tabs } from "@shopify/polaris";
import { useState, useCallback } from "react";
import { useNavigate, useLocation } from "@remix-run/react";
import AppSettings from "./app.settings";
import AppLogs from "./app.logs";

export default function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  
  const selectedTab = location.pathname.includes('/logs') ? 1 : 0;

  const handleTabChange = useCallback(
    (selectedTabIndex) => {
      const path = selectedTabIndex === 0 ? '/app' : '/app/logs';
      navigate(path);
    },
    [navigate]
  );

  const tabs = [
    {
      id: 'settings',
      content: 'Settings',
      panelID: 'settings-panel',
    },
    {
      id: 'logs',
      content: 'Logs',
      panelID: 'logs-panel',
    },
  ];

  return (
    <Page title="Order Splitter">
      <Tabs tabs={tabs} selected={selectedTab} onSelect={handleTabChange}>
        {selectedTab === 0 && <AppSettings />}
        {selectedTab === 1 && <AppLogs />}
      </Tabs>
    </Page>
  );
}