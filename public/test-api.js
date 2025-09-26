// Test script to verify API functionality
const testMeetingAPI = async () => {
  try {
    console.log('Testing meeting creation API...');
    const response = await fetch('/api/meeting/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        meeting_code: 'TEST123',
        title: 'Test Meeting',
        anonymous_name: 'Test User',
        settings: {
          enableVideo: true,
          enableAudio: true,
          allowScreenShare: true
        }
      })
    });
    
    const result = await response.json();
    console.log('API Response:', result);
    
    if (result.success) {
      console.log('✅ Meeting creation API is working!');
      
      // Test join API
      console.log('Testing meeting join API...');
      const joinResponse = await fetch('/api/meeting/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          meeting_code: result.meeting.meeting_code,
          anonymous_name: 'Test Joiner',
          session_id: 'test-session-123'
        })
      });
      
      const joinResult = await joinResponse.json();
      console.log('Join API Response:', joinResult);
      
      if (joinResult.success) {
        console.log('✅ Meeting join API is working!');
      } else {
        console.error('❌ Meeting join API failed:', joinResult.error);
      }
    } else {
      console.error('❌ Meeting creation API failed:', result.error);
    }
  } catch (error) {
    console.error('❌ API test failed:', error);
  }
};

// Run the test
console.log('Starting API functionality test...');
testMeetingAPI();