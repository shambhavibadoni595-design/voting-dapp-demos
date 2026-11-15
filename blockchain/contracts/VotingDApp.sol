// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title  VotingDApp
 * @notice The on-chain backend for Ballot. Every poll, option, vote count and
 *         voter record lives in this contract, and every rule is enforced here,
 *         not in the website.
 *
 * Rules
 *  - Anyone can create a poll with 2 to 10 non-empty options.
 *  - A poll stays open for 1 minute to 30 days from the block it was created in.
 *  - Each address can vote once per poll. Votes cannot be changed.
 *  - Only the poll's creator can close it early.
 *  - There is no owner and no admin: nobody can edit, delete or reopen a poll.
 */
contract VotingDApp {
    // ---------------------------------------------------------------------
    // Limits
    // ---------------------------------------------------------------------

    uint256 public constant MIN_OPTIONS = 2;
    uint256 public constant MAX_OPTIONS = 10;
    uint256 public constant MIN_DURATION = 1 minutes;
    uint256 public constant MAX_DURATION = 30 days;

    /// Byte limits keep storage and read costs bounded (UTF-8 bytes, not characters).
    uint256 public constant MAX_QUESTION_BYTES = 280;
    uint256 public constant MAX_DESCRIPTION_BYTES = 1000;
    uint256 public constant MAX_OPTION_BYTES = 100;

    /// Upper bound for one page returned by getPolls().
    uint256 public constant MAX_PAGE_SIZE = 50;

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    struct Poll {
        string question;
        string description;
        string[] options;
        uint256[] votes;
        address creator;
        uint64 createdAt;
        uint64 endTime;   // voting allowed while block.timestamp < endTime
        uint64 closedAt;  // 0 unless the creator closed the poll early
        uint256 totalVotes;
    }

    /// Read model returned to the website.
    struct PollView {
        uint256 id;
        string question;
        string description;
        string[] options;
        uint256[] votes;
        address creator;
        uint256 createdAt;
        uint256 endTime;
        uint256 closedAt;
        uint256 totalVotes;
        bool isOpen;
        bool closedEarly;
    }

    uint256 public pollCount;
    uint256 public totalVotesCast;

    mapping(uint256 => Poll) private _polls;

    /// pollId => voter => (optionIndex + 1). Zero means "has not voted".
    mapping(uint256 => mapping(address => uint256)) private _choicePlusOne;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event PollCreated(
        uint256 indexed pollId,
        address indexed creator,
        string question,
        uint256 optionCount,
        uint256 createdAt,
        uint256 endTime
    );

    event Voted(
        uint256 indexed pollId,
        address indexed voter,
        uint256 indexed optionIndex,
        uint256 timestamp
    );

    event PollClosed(
        uint256 indexed pollId,
        address indexed closer,
        uint256 timestamp
    );

    // ---------------------------------------------------------------------
    // Modifiers
    // ---------------------------------------------------------------------

    modifier pollExists(uint256 pollId) {
        require(pollId < pollCount, "Poll does not exist");
        _;
    }

    // ---------------------------------------------------------------------
    // Writes
    // ---------------------------------------------------------------------

    /**
     * @notice Create a poll.
     * @param question        The question voters answer (1 to 280 bytes).
     * @param description     Optional context (0 to 1000 bytes).
     * @param options         2 to 10 answers, each 1 to 100 bytes.
     * @param durationSeconds How long the poll stays open: 60 to 2,592,000 seconds.
     * @return pollId         The new poll's sequential ID, starting at 0.
     */
    function createPoll(
        string calldata question,
        string calldata description,
        string[] calldata options,
        uint256 durationSeconds
    ) external returns (uint256 pollId) {
        uint256 qLen = bytes(question).length;
        require(qLen > 0, "Question cannot be empty");
        require(qLen <= MAX_QUESTION_BYTES, "Question is too long");
        require(bytes(description).length <= MAX_DESCRIPTION_BYTES, "Description is too long");
        require(
            options.length >= MIN_OPTIONS && options.length <= MAX_OPTIONS,
            "Need 2 to 10 options"
        );
        require(
            durationSeconds >= MIN_DURATION && durationSeconds <= MAX_DURATION,
            "Duration must be 1 minute to 30 days"
        );

        pollId = pollCount;
        pollCount = pollId + 1;

        Poll storage p = _polls[pollId];
        p.question = question;
        p.description = description;
        p.creator = msg.sender;
        p.createdAt = uint64(block.timestamp);
        p.endTime = uint64(block.timestamp + durationSeconds);

        for (uint256 i = 0; i < options.length; i++) {
            uint256 oLen = bytes(options[i]).length;
            require(oLen > 0, "Option cannot be empty");
            require(oLen <= MAX_OPTION_BYTES, "Option is too long");
            p.options.push(options[i]);
            p.votes.push(0);
        }

        emit PollCreated(pollId, msg.sender, question, options.length, block.timestamp, p.endTime);
    }

    /**
     * @notice Cast one vote on an open poll. Each address may vote once per poll.
     */
    function vote(uint256 pollId, uint256 optionIndex) external pollExists(pollId) {
        Poll storage p = _polls[pollId];
        require(_isOpen(p), "Poll is closed");
        require(_choicePlusOne[pollId][msg.sender] == 0, "You have already voted");
        require(optionIndex < p.options.length, "Invalid option");

        _choicePlusOne[pollId][msg.sender] = optionIndex + 1;
        p.votes[optionIndex] += 1;
        p.totalVotes += 1;
        totalVotesCast += 1;

        emit Voted(pollId, msg.sender, optionIndex, block.timestamp);
    }

    /**
     * @notice Close a poll before its deadline. Only the creator can do this.
     */
    function closePoll(uint256 pollId) external pollExists(pollId) {
        Poll storage p = _polls[pollId];
        require(msg.sender == p.creator, "Only the creator can close this poll");
        require(_isOpen(p), "Poll is already closed");

        p.closedAt = uint64(block.timestamp);

        emit PollClosed(pollId, msg.sender, block.timestamp);
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    function isPollOpen(uint256 pollId) external view returns (bool) {
        if (pollId >= pollCount) return false;
        return _isOpen(_polls[pollId]);
    }

    function hasVoted(uint256 pollId, address voter) external view returns (bool) {
        return _choicePlusOne[pollId][voter] != 0;
    }

    /**
     * @notice Whether `voter` voted on `pollId`, and which option they chose.
     *         optionIndex is 0 when voted is false; check `voted` first.
     */
    function getVoterChoice(uint256 pollId, address voter)
        external
        view
        returns (bool voted, uint256 optionIndex)
    {
        uint256 stored = _choicePlusOne[pollId][voter];
        if (stored == 0) return (false, 0);
        return (true, stored - 1);
    }

    function getPoll(uint256 pollId) external view pollExists(pollId) returns (PollView memory) {
        return _view(pollId);
    }

    /**
     * @notice Read polls by ID range [offset, offset + limit), capped at MAX_PAGE_SIZE.
     *         Returns an empty array when offset is past the last poll.
     */
    function getPolls(uint256 offset, uint256 limit) external view returns (PollView[] memory page) {
        if (offset >= pollCount || limit == 0) return new PollView[](0);
        if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;
        uint256 end = offset + limit;
        if (end > pollCount) end = pollCount;

        page = new PollView[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _view(i);
        }
    }

    /// Totals for the home page. Open-poll counts are derived from getPolls().
    function getStats() external view returns (uint256 totalPolls, uint256 totalVotes) {
        return (pollCount, totalVotesCast);
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    function _isOpen(Poll storage p) private view returns (bool) {
        return p.closedAt == 0 && block.timestamp < p.endTime;
    }

    function _view(uint256 id) private view returns (PollView memory) {
        Poll storage p = _polls[id];
        return PollView({
            id: id,
            question: p.question,
            description: p.description,
            options: p.options,
            votes: p.votes,
            creator: p.creator,
            createdAt: p.createdAt,
            endTime: p.endTime,
            closedAt: p.closedAt,
            totalVotes: p.totalVotes,
            isOpen: _isOpen(p),
            closedEarly: p.closedAt != 0
        });
    }
}
