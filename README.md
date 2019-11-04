# bwe-stats-viewer
![image](https://user-images.githubusercontent.com/1070835/62775996-9bf0ce00-baa9-11e9-8262-9304c830b471.png)
## Online
https://medooze.github.io/bwe-stats-viewer/

## BWE stats file input

The stats viewers requires a `csv` file with `\n` line ends with one entry per RTP packet containint the following information:

 - 0: Feedback timestamp for rtp packet
 - 1: Transport wide seq num of rtp packet [Not currently used for stats viewer]
 - 2: Feedback packet num [Not currently used for stats viewer]
 - 3: total packet size
 - 4: Sent time for packet on sender clock
 - 5: Received timestamp for rtp packet pn receiver clock (or `0` if lost) 
 - 6: Delta time with previous sent rtp packet (`0` if lost) [Not currently used for stats viewer]
 - 7: Delta time with previous received timestamp (`0` if lost) [Not currently used for stats viewer]
 - 8: Delta sent time - delta received time
 - 9: Raw Estimated bitrate [Not currently used for stats viewer]
 - 10: Target bitrate for probing
 - 11: Available bitrate, adjusted bwe estimation reported back to the app (BWE minus RTX allocation based on packet loss)
 - 12: rtt 
 - 13: mark flag of RTP packet [Not currently used for stats viewer]
 - 14: `1` if packet was a retransmission, `0` otherwise
 - 15: `1` if packet was for probing, `0` otherwise 

Measures:
 - All timestamps and time metics are in nanoseconds (even rtt)
 - All bitrates are in `bps`

## BWE stats

The following charts are created

### Bitrate chart

Provides information about the sent and reported received bitrate based on feedback stats and bitrate estimation based on algorithm output:

 - BWE : available bitrate
 - Target: target  bitrate
 - Total sent: accumulated bitrate sent
 - Total sent: accumulated bitrate received
 - Media: accumulated bitrate for `!rtx` and `!probing` packets
 - RTX: accumulated bitrate for `rtx` packets
 - Probing: accumulated bitrate for `probing` packets

Note: All acumulated bitrates are based on the `size` stat on the input file and calculated over time window of `250ms`
Note: All calculated bitrate grahpics are display on `sent` timestamp, for the metrics comming for the stat file, they are displayed on the feedback timestamp.

### Delay and lost chart

Provides delays information based on feedback stats

 - RTT: RTT in ms
 - Network delay: Accumulated value of `delta`, with a minimum at 0
 - Feedback delay: Delay between pacekt sent time and the time when the feedback is recevied by for that packet.
 - Lost: Not currently displayed [TODO: find good way of displaying it as accumulated value doesn't seem appropiate)
