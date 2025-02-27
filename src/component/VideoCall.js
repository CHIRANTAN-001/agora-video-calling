const { useRef, useState, useEffect } = require('react');

// This component will only be loaded on the client side
export const VideoCall = () => {
    // Import AgoraRTC dynamically to avoid SSR issues
    const [AgoraRTC, setAgoraRTC] = useState(null);
    // Refs and states
    const clientRef = useRef(null);
    const localTrackRef = useRef({ audioTrack: null, videoTrack: null });
    const [users, setUsers] = useState([]);
    const [joined, setJoined] = useState(false);
    const [muted, setMuted] = useState(false);
    const [error, setError] = useState("");


    console.log(users)

    // Agora credentials - updated
    const APP_ID = "4d3ed950201c4b5d9dbfae82f0124ecf";
    // Use null for token for testing - in production you should generate a proper token
    const TOKEN = "007eJxSYOj/YPKxNlHk2cS+jroND7hUGFsffsqUvsosuF55a/bxc/EKDCYpxqkplqYGRgaGySZJpimWKUlpiakWRmkGhkYmqclpt+UOpAvwMTAUMfWyMDIwMrAwMDKA+ExgkhlMsoBJHoaS1OIS3eSMxLy81BwGBkAAAAD//4mGIjA="; // Using null will bypass token authentication for development
    const CHANNEL_ID = "test-channel";

    // Import Agora SDK only on client side
    useEffect(() => {
        const loadAgoraSDK = async () => {
            try {
                const AgoraRTCModule = await import('agora-rtc-sdk-ng');
                console.log(AgoraRTCModule)
                setAgoraRTC(AgoraRTCModule.default);
            } catch (error) {
                console.error("Failed to load Agora SDK:", error);
                setError("Failed to load Agora SDK. Please refresh the page.");
            }
        };
        loadAgoraSDK();
    }, []);

    // Initialize on component mount and when AgoraRTC is loaded
    useEffect(() => {
        if (AgoraRTC) {
            initialize();
        }

        return () => {
            // Cleanup function
            if (localTrackRef.current.audioTrack) {
                localTrackRef.current.audioTrack.close();
            }
            if (localTrackRef.current.videoTrack) {
                localTrackRef.current.videoTrack.close();
            }
            if (clientRef.current) {
                clientRef.current.leave();
            }
        };
    }, [AgoraRTC]);

    // Initialize Agora client
    function initialize() {
        if (!AgoraRTC) return;

        clientRef.current = AgoraRTC.createClient({
            mode: "rtc",
            codec: "vp8"
        });
        setupEventListeners();
    }

    // Setup event listeners for remote users
    function setupEventListeners() {
        if (!clientRef.current) return;

        // Handle when a user publishes media
        clientRef.current.on("user-published", async (user, mediaType) => {
            await clientRef.current.subscribe(user, mediaType);

            // If a new user joins, add them to our state
            if (mediaType === "video") {
                setUsers(prevUsers => {
                    // Check if user already exists
                    if (prevUsers.find(u => u.uid === user.uid)) {
                        return prevUsers.map(u => {
                            if (u.uid === user.uid) {
                                return { ...u, videoTrack: user.videoTrack };
                            }
                            return u;
                        });
                    } else {
                        return [...prevUsers, { uid: user.uid, videoTrack: user.videoTrack, audioTrack: null }];
                    }
                });
            }

            if (mediaType === "audio") {
                user.audioTrack.play();
                setUsers(prevUsers => {
                    // Check if user already exists
                    if (prevUsers.find(u => u.uid === user.uid)) {
                        return prevUsers.map(u => {
                            if (u.uid === user.uid) {
                                return { ...u, audioTrack: user.audioTrack };
                            }
                            return u;
                        });
                    } else {
                        return [...prevUsers, { uid: user.uid, audioTrack: user.audioTrack, videoTrack: null }];
                    }
                });
            }
        });

        // Handle when a user unpublishes media
        clientRef.current.on("user-unpublished", (user) => {
            setUsers(prevUsers => prevUsers.filter(u => u.uid !== user.uid));
        });

        // Handle when a user leaves
        clientRef.current.on("user-left", (user) => {
            setUsers(prevUsers => prevUsers.filter(u => u.uid !== user.uid));
        });
    }

    // Join the channel and create local tracks
    async function joinChannel() {
        if (!AgoraRTC || !clientRef.current) return;
        setError("");

        try {
            // For development/testing, you can use a numeric UID instead of UUID
            const uid = crypto.randomUUID();

            // Join the channel - using null for token for testing
            await clientRef.current.join(APP_ID, CHANNEL_ID, TOKEN, uid);

            const videoConfig = {
                width: 1920,
                height: 1080,
                bitrate: 1000 // Adjust bitrate as needed
            };

            // Create local tracks
            const audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
            const videoTrack = await AgoraRTC.createCameraVideoTrack();

            videoTrack.setEncoderConfiguration(videoConfig);

            localTrackRef.current = { audioTrack, videoTrack };

            // Publish the tracks
            await clientRef.current.publish([audioTrack, videoTrack]);

            // Add yourself to the list of users
            setUsers(prevUsers => [
                ...prevUsers,
                {
                    uid,
                    videoTrack: videoTrack,
                    audioTrack: audioTrack,
                    isLocal: true
                }
            ]);

            setJoined(true);
        } catch (error) {
            console.error("Error joining channel:", error);
            setError(`Failed to join: ${error.message}`);
        }
    }

    // Leave the channel
    async function leaveChannel() {
        if (!clientRef.current) return;

        if (localTrackRef.current.audioTrack) {
            localTrackRef.current.audioTrack.close();
        }
        if (localTrackRef.current.videoTrack) {
            localTrackRef.current.videoTrack.close();
        }

        await clientRef.current.leave();
        setUsers(prevUsers => prevUsers.filter(user => !user.isLocal));
        setJoined(false);
    }

    // Toggle mute state
    function toggleMute() {
        if (localTrackRef.current.audioTrack) {
            if (muted) {
                localTrackRef.current.audioTrack.setEnabled(true);
            } else {
                localTrackRef.current.audioTrack.setEnabled(false);
            }
            setMuted(!muted);
        }
    }

    // Create a component for rendering a user's video
    const UserVideo = ({ user }) => {
        const videoRef = useRef(null);

        useEffect(() => {
            if (videoRef.current && user && user.videoTrack) {
                user.videoTrack.play(videoRef.current);
            }

            return () => {
                if (user && user.videoTrack) {
                    user.videoTrack.stop();
                }
            };
        }, [user, user?.videoTrack]);

        return (
            <div
                ref={videoRef}
                className="w-full h-full relative rounded-lg overflow-hidden bg-gray-800"
            >
                <div className="absolute z-10 bottom-2 left-2 p-2 bg-gray-800 rounded-xl text-white text-sm">
                    {user.isLocal ? "You" : user.uid}
                </div>

            </div>
        );
    };

    // Determine grid columns based on total users
    const getGridClass = () => {
        const totalUsers = users.length;

        // Single user takes full width
        if (totalUsers <= 1) {
            return "grid-cols-1";
        }
        // Two users take two columns
        else if (totalUsers === 2) {
            return "grid-cols-2";
        }
        // 3-4 users take two columns with two rows
        else if (totalUsers <= 4) {
            return "grid-cols-2";
        }
        // 5-6 users take three columns with two rows
        else if (totalUsers <= 6) {
            return "grid-cols-3";
        }
        // More than 6 users (you mentioned max 6)
        else {
            return "grid-cols-3";
        }
    };

    // If Agora SDK is not loaded yet, show loading state
    if (!AgoraRTC) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-900">
                <div className="text-white text-xl">Loading video call capabilities...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900 p-4">
            {/* Video Grid */}
            <div className={`grid ${getGridClass()} gap-4 flex-grow`}>
                {users.map(user => (
                    <div key={user.uid} className="w-full h-full">
                        <UserVideo user={user} />
                    </div>
                ))}
                {users.length === 0 && (
                    <div className="flex items-center justify-center bg-gray-800 rounded-lg">
                        <div className="text-white text-lg">No active video streams</div>
                    </div>
                )}
            </div>

            {/* Error message */}
            {error && (
                <div className="bg-red-600 text-white p-3 my-2 rounded-md">
                    {error}
                </div>
            )}

            {/* Controls */}
            <div className="flex justify-center items-center space-x-6 py-6">
                {/* Mic Button */}
                <button
                    onClick={toggleMute}
                    disabled={!joined}
                    className={`w-12 h-12 rounded-full flex items-center justify-center ${muted ? 'bg-red-500' : 'bg-gray-700'
                        } ${!joined ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    {muted ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    )}
                </button>

                {/* Join/Leave Button */}
                {!joined ? (
                    <button
                        onClick={joinChannel}
                        className="px-6 py-2 bg-green-600 text-white rounded-full font-medium"
                    >
                        Join Call
                    </button>
                ) : (
                    <button
                        onClick={leaveChannel}
                        className="px-6 py-2 bg-red-600 text-white rounded-full font-medium"
                    >
                        Leave Call
                    </button>
                )}
            </div>
        </div>
    );
};