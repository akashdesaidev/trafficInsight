"use client";

import { useEffect, useState } from "react";

interface TrafficTestProps {
  visible: boolean;
}

export default function TrafficTestComponent({ visible }: TrafficTestProps) {
  const [testResult, setTestResult] = useState<string>("Testing...");

  useEffect(() => {
    if (!visible) return;

    const testTrafficEndpoint = async () => {
      try {
        console.log("🧪 Testing traffic endpoint...");
        
        // Test the backend endpoint
        const bbox = "77.5,12.9,77.7,13.1"; // Bangalore area
        const url = `/api/traffic/flow-data?bbox=${bbox}&zoom=12`;
        
        console.log("🌐 Fetching:", url);
        const response = await fetch(url);
        console.log("📡 Response status:", response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log("📊 Traffic data received:", data);
          
          const pointCount = data.flowSegmentData?.length || 0;
          setTestResult(`✅ SUCCESS: ${pointCount} traffic points received`);
          
          if (pointCount > 0) {
            const sample = data.flowSegmentData[0];
            console.log("📍 Sample traffic point:", {
              location: sample.coordinates,
              speed: `${sample.currentSpeed}/${sample.freeFlowSpeed} km/h`,
              closure: sample.roadClosure
            });
          }
        } else {
          const errorText = await response.text();
          console.error("❌ API Error:", errorText);
          setTestResult(`❌ ERROR: ${response.status} - ${errorText}`);
        }
      } catch (error) {
        console.error("❌ Network Error:", error);
        setTestResult(`❌ NETWORK ERROR: ${error}`);
      }
    };

    testTrafficEndpoint();
  }, [visible]);

  if (!visible) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: '100px',
        right: '20px',
        zIndex: 1000,
        background: 'white',
        padding: '10px',
        border: '2px solid #ccc',
        borderRadius: '5px',
        maxWidth: '300px',
        fontSize: '12px'
      }}
    >
      <h4 style={{ margin: '0 0 10px 0' }}>🔍 Traffic Debug</h4>
      <p style={{ margin: 0 }}>{testResult}</p>
      <p style={{ margin: '10px 0 0 0', fontSize: '10px', color: '#666' }}>
        Check browser console for detailed logs
      </p>
    </div>
  );
}