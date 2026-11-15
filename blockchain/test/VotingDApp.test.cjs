const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

const MINUTE = 60;
const DAY = 24 * 60 * MINUTE;

const SAMPLE_QUESTION = "Which technology will have the biggest impact on the future?";
const SAMPLE_OPTIONS = [
  "Artificial Intelligence (AI)",
  "Blockchain & Web3",
  "Quantum Computing",
  "Robotics & Automation",
];

async function deployFixture() {
  const [creator, alice, bob, carol, dave, mallory] = await ethers.getSigners();
  const Voting = await ethers.getContractFactory("VotingDApp");
  const voting = await Voting.deploy();
  await voting.waitForDeployment();
  return { voting, creator, alice, bob, carol, dave, mallory };
}

async function withPollFixture() {
  const ctx = await deployFixture();
  await ctx.voting
    .connect(ctx.creator)
    .createPoll(SAMPLE_QUESTION, "Pick one.", SAMPLE_OPTIONS, 2 * 60 * MINUTE);
  const poll = await ctx.voting.getPoll(0);
  return { ...ctx, endTime: Number(poll.endTime) };
}

describe("VotingDApp", function () {
  describe("Deployment", function () {
    it("starts empty with the documented limits", async function () {
      const { voting } = await loadFixture(deployFixture);
      expect(await voting.pollCount()).to.equal(0);
      expect(await voting.totalVotesCast()).to.equal(0);
      expect(await voting.MIN_OPTIONS()).to.equal(2);
      expect(await voting.MAX_OPTIONS()).to.equal(10);
      expect(await voting.MIN_DURATION()).to.equal(MINUTE);
      expect(await voting.MAX_DURATION()).to.equal(30 * DAY);
      const [totalPolls, totalVotes] = await voting.getStats();
      expect(totalPolls).to.equal(0);
      expect(totalVotes).to.equal(0);
    });
  });

  describe("Poll creation", function () {
    it("stores the poll and emits PollCreated with the right values", async function () {
      const { voting, creator } = await loadFixture(deployFixture);
      const duration = 7 * DAY;

      const tx = await voting.createPoll(SAMPLE_QUESTION, "Context here", SAMPLE_OPTIONS, duration);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(voting, "PollCreated")
        .withArgs(0, creator.address, SAMPLE_QUESTION, 4, block.timestamp, block.timestamp + duration);

      const poll = await voting.getPoll(0);
      expect(poll.id).to.equal(0);
      expect(poll.question).to.equal(SAMPLE_QUESTION);
      expect(poll.description).to.equal("Context here");
      expect(poll.options).to.deep.equal(SAMPLE_OPTIONS);
      expect(poll.votes.map(Number)).to.deep.equal([0, 0, 0, 0]);
      expect(poll.creator).to.equal(creator.address);
      expect(poll.createdAt).to.equal(block.timestamp);
      expect(poll.endTime).to.equal(block.timestamp + duration);
      expect(poll.closedAt).to.equal(0);
      expect(poll.totalVotes).to.equal(0);
      expect(poll.isOpen).to.equal(true);
      expect(poll.closedEarly).to.equal(false);
    });

    it("assigns sequential IDs and returns the new ID", async function () {
      const { voting, alice } = await loadFixture(deployFixture);
      expect(await voting.createPoll.staticCall("Q0", "", ["A", "B"], MINUTE)).to.equal(0);
      await voting.createPoll("Q0", "", ["A", "B"], MINUTE);
      await voting.connect(alice).createPoll("Q1", "", ["A", "B"], MINUTE);
      expect(await voting.createPoll.staticCall("Q2", "", ["A", "B"], MINUTE)).to.equal(2);
      expect(await voting.pollCount()).to.equal(2);
      expect((await voting.getPoll(1)).creator).to.equal(alice.address);
    });

    it("allows an empty description", async function () {
      const { voting } = await loadFixture(deployFixture);
      await voting.createPoll("Q?", "", ["A", "B"], MINUTE);
      expect((await voting.getPoll(0)).description).to.equal("");
    });

    it("rejects an empty question", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createPoll("", "", ["A", "B"], MINUTE)).to.be.revertedWith(
        "Question cannot be empty"
      );
    });

    it("enforces the 280-byte question limit (bytes, not characters)", async function () {
      const { voting } = await loadFixture(deployFixture);
      await voting.createPoll("q".repeat(280), "", ["A", "B"], MINUTE);
      await expect(voting.createPoll("q".repeat(281), "", ["A", "B"], MINUTE)).to.be.revertedWith(
        "Question is too long"
      );
      // "मत" is 2 characters but 6 UTF-8 bytes; 47 copies = 282 bytes.
      await expect(voting.createPoll("मत".repeat(47), "", ["A", "B"], MINUTE)).to.be.revertedWith(
        "Question is too long"
      );
    });

    it("enforces the 1000-byte description limit", async function () {
      const { voting } = await loadFixture(deployFixture);
      await voting.createPoll("Q?", "d".repeat(1000), ["A", "B"], MINUTE);
      await expect(voting.createPoll("Q?", "d".repeat(1001), ["A", "B"], MINUTE)).to.be.revertedWith(
        "Description is too long"
      );
    });

    it("requires at least two options", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createPoll("Q?", "", [], MINUTE)).to.be.revertedWith("Need 2 to 10 options");
      await expect(voting.createPoll("Q?", "", ["Only"], MINUTE)).to.be.revertedWith(
        "Need 2 to 10 options"
      );
      await voting.createPoll("Q?", "", ["A", "B"], MINUTE);
    });

    it("allows ten options and rejects eleven", async function () {
      const { voting } = await loadFixture(deployFixture);
      const ten = Array.from({ length: 10 }, (_, i) => `Option ${i + 1}`);
      await voting.createPoll("Q?", "", ten, MINUTE);
      expect((await voting.getPoll(0)).options.length).to.equal(10);
      await expect(voting.createPoll("Q?", "", [...ten, "Eleven"], MINUTE)).to.be.revertedWith(
        "Need 2 to 10 options"
      );
    });

    it("rejects an empty option in any position", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createPoll("Q?", "", ["", "B"], MINUTE)).to.be.revertedWith(
        "Option cannot be empty"
      );
      await expect(voting.createPoll("Q?", "", ["A", "B", ""], MINUTE)).to.be.revertedWith(
        "Option cannot be empty"
      );
    });

    it("enforces the 100-byte option limit", async function () {
      const { voting } = await loadFixture(deployFixture);
      await voting.createPoll("Q?", "", ["a".repeat(100), "B"], MINUTE);
      await expect(voting.createPoll("Q?", "", ["a".repeat(101), "B"], MINUTE)).to.be.revertedWith(
        "Option is too long"
      );
    });

    it("accepts exactly 1 minute and exactly 30 days, and nothing outside", async function () {
      const { voting } = await loadFixture(deployFixture);
      await voting.createPoll("Q?", "", ["A", "B"], MINUTE);
      await voting.createPoll("Q?", "", ["A", "B"], 30 * DAY);
      await expect(voting.createPoll("Q?", "", ["A", "B"], MINUTE - 1)).to.be.revertedWith(
        "Duration must be 1 minute to 30 days"
      );
      await expect(voting.createPoll("Q?", "", ["A", "B"], 0)).to.be.revertedWith(
        "Duration must be 1 minute to 30 days"
      );
      await expect(voting.createPoll("Q?", "", ["A", "B"], 30 * DAY + 1)).to.be.revertedWith(
        "Duration must be 1 minute to 30 days"
      );
    });

    it("does not change state when creation reverts", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.createPoll("Q?", "", ["A"], MINUTE)).to.be.reverted;
      expect(await voting.pollCount()).to.equal(0);
    });
  });

  describe("Voting", function () {
    it("records a vote, updates counts and emits Voted", async function () {
      const { voting, alice } = await loadFixture(withPollFixture);
      const tx = await voting.connect(alice).vote(0, 1);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx).to.emit(voting, "Voted").withArgs(0, alice.address, 1, block.timestamp);

      const poll = await voting.getPoll(0);
      expect(poll.votes.map(Number)).to.deep.equal([0, 1, 0, 0]);
      expect(poll.totalVotes).to.equal(1);
      expect(await voting.totalVotesCast()).to.equal(1);
      expect(await voting.hasVoted(0, alice.address)).to.equal(true);

      const [voted, optionIndex] = await voting.getVoterChoice(0, alice.address);
      expect(voted).to.equal(true);
      expect(optionIndex).to.equal(1);
    });

    it("distinguishes a vote for option 0 from not having voted", async function () {
      const { voting, alice, bob } = await loadFixture(withPollFixture);
      await voting.connect(alice).vote(0, 0);
      const [aliceVoted, aliceChoice] = await voting.getVoterChoice(0, alice.address);
      const [bobVoted] = await voting.getVoterChoice(0, bob.address);
      expect(aliceVoted).to.equal(true);
      expect(aliceChoice).to.equal(0);
      expect(bobVoted).to.equal(false);
      expect(await voting.hasVoted(0, bob.address)).to.equal(false);
    });

    it("rejects a second vote from the same address, for any option", async function () {
      const { voting, alice } = await loadFixture(withPollFixture);
      await voting.connect(alice).vote(0, 2);
      await expect(voting.connect(alice).vote(0, 2)).to.be.revertedWith("You have already voted");
      await expect(voting.connect(alice).vote(0, 0)).to.be.revertedWith("You have already voted");
      const poll = await voting.getPoll(0);
      expect(poll.totalVotes).to.equal(1);
      const [, choice] = await voting.getVoterChoice(0, alice.address);
      expect(choice).to.equal(2);
    });

    it("rejects an option index outside the poll", async function () {
      const { voting, alice } = await loadFixture(withPollFixture);
      await expect(voting.connect(alice).vote(0, 4)).to.be.revertedWith("Invalid option");
      await expect(voting.connect(alice).vote(0, 99)).to.be.revertedWith("Invalid option");
      await expect(voting.connect(alice).vote(0, ethers.MaxUint256)).to.be.revertedWith("Invalid option");
      expect(await voting.hasVoted(0, alice.address)).to.equal(false);
    });

    it("rejects votes on a poll that does not exist", async function () {
      const { voting, alice } = await loadFixture(withPollFixture);
      await expect(voting.connect(alice).vote(1, 0)).to.be.revertedWith("Poll does not exist");
      await expect(voting.connect(alice).vote(999, 0)).to.be.revertedWith("Poll does not exist");
    });

    it("accepts a vote one second before the deadline and rejects one at the deadline", async function () {
      const { voting, alice, bob, endTime } = await loadFixture(withPollFixture);
      await time.setNextBlockTimestamp(endTime - 1);
      await voting.connect(alice).vote(0, 0);

      await time.setNextBlockTimestamp(endTime);
      await expect(voting.connect(bob).vote(0, 0)).to.be.revertedWith("Poll is closed");
      expect(await voting.isPollOpen(0)).to.equal(false);
    });

    it("rejects votes after the poll expires and keeps the results readable", async function () {
      const { voting, alice, bob } = await loadFixture(withPollFixture);
      await voting.connect(alice).vote(0, 3);
      await time.increase(2 * 60 * MINUTE + 1);
      await expect(voting.connect(bob).vote(0, 3)).to.be.revertedWith("Poll is closed");

      const poll = await voting.getPoll(0);
      expect(poll.isOpen).to.equal(false);
      expect(poll.closedEarly).to.equal(false);
      expect(poll.votes.map(Number)).to.deep.equal([0, 0, 0, 1]);
    });

    it("rejects votes after the creator closes the poll", async function () {
      const { voting, creator, alice } = await loadFixture(withPollFixture);
      await voting.connect(creator).closePoll(0);
      await expect(voting.connect(alice).vote(0, 0)).to.be.revertedWith("Poll is closed");
    });

    it("lets one address vote once on each of several polls", async function () {
      const { voting, alice } = await loadFixture(withPollFixture);
      await voting.createPoll("Second?", "", ["Yes", "No"], DAY);
      await voting.connect(alice).vote(0, 0);
      await voting.connect(alice).vote(1, 1);
      expect((await voting.getVoterChoice(0, alice.address))[1]).to.equal(0);
      expect((await voting.getVoterChoice(1, alice.address))[1]).to.equal(1);
      expect(await voting.totalVotesCast()).to.equal(2);
    });

    it("counts many votes accurately per option, per poll and overall", async function () {
      const { voting } = await loadFixture(withPollFixture);
      await voting.createPoll("Other?", "", ["X", "Y"], DAY);

      const signers = await ethers.getSigners();
      // 12 voters on poll 0 with a known distribution; 5 voters on poll 1.
      const plan0 = [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 3, 0];
      const plan1 = [1, 1, 0, 1, 1];
      for (let i = 0; i < plan0.length; i++) await voting.connect(signers[i + 1]).vote(0, plan0[i]);
      for (let i = 0; i < plan1.length; i++) await voting.connect(signers[i + 1]).vote(1, plan1[i]);

      const p0 = await voting.getPoll(0);
      const p1 = await voting.getPoll(1);
      expect(p0.votes.map(Number)).to.deep.equal([6, 3, 2, 1]);
      expect(p0.totalVotes).to.equal(12);
      expect(p1.votes.map(Number)).to.deep.equal([1, 4]);
      expect(p1.totalVotes).to.equal(5);

      const [totalPolls, totalVotes] = await voting.getStats();
      expect(totalPolls).to.equal(2);
      expect(totalVotes).to.equal(17);
    });
  });

  describe("Closing a poll early", function () {
    it("lets the creator close an open poll and emits PollClosed", async function () {
      const { voting, creator, alice } = await loadFixture(withPollFixture);
      await voting.connect(alice).vote(0, 1);

      const tx = await voting.connect(creator).closePoll(0);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      await expect(tx).to.emit(voting, "PollClosed").withArgs(0, creator.address, block.timestamp);

      const poll = await voting.getPoll(0);
      expect(poll.isOpen).to.equal(false);
      expect(poll.closedEarly).to.equal(true);
      expect(poll.closedAt).to.equal(block.timestamp);
      expect(poll.votes.map(Number)).to.deep.equal([0, 1, 0, 0]);
      expect(await voting.isPollOpen(0)).to.equal(false);
    });

    it("rejects closing by anyone other than the creator", async function () {
      const { voting, alice, mallory } = await loadFixture(withPollFixture);
      await expect(voting.connect(mallory).closePoll(0)).to.be.revertedWith(
        "Only the creator can close this poll"
      );
      await expect(voting.connect(alice).closePoll(0)).to.be.revertedWith(
        "Only the creator can close this poll"
      );
      expect(await voting.isPollOpen(0)).to.equal(true);
    });

    it("lets a non-default creator close only their own poll", async function () {
      const { voting, creator, alice } = await loadFixture(withPollFixture);
      await voting.connect(alice).createPoll("Alice's poll", "", ["A", "B"], DAY);
      await expect(voting.connect(alice).closePoll(0)).to.be.revertedWith(
        "Only the creator can close this poll"
      );
      await expect(voting.connect(creator).closePoll(1)).to.be.revertedWith(
        "Only the creator can close this poll"
      );
      await expect(voting.connect(alice).closePoll(1)).to.emit(voting, "PollClosed").withArgs(1, alice.address, anyValue);
    });

    it("rejects closing twice", async function () {
      const { voting, creator } = await loadFixture(withPollFixture);
      await voting.connect(creator).closePoll(0);
      await expect(voting.connect(creator).closePoll(0)).to.be.revertedWith("Poll is already closed");
    });

    it("rejects closing a poll that already expired", async function () {
      const { voting, creator } = await loadFixture(withPollFixture);
      await time.increase(2 * 60 * MINUTE + 1);
      await expect(voting.connect(creator).closePoll(0)).to.be.revertedWith("Poll is already closed");
      expect((await voting.getPoll(0)).closedEarly).to.equal(false);
    });

    it("rejects closing a poll that does not exist", async function () {
      const { voting, creator } = await loadFixture(withPollFixture);
      await expect(voting.connect(creator).closePoll(7)).to.be.revertedWith("Poll does not exist");
    });
  });

  describe("Reading polls", function () {
    it("reverts getPoll for a missing ID and reports it as not open", async function () {
      const { voting } = await loadFixture(deployFixture);
      await expect(voting.getPoll(0)).to.be.revertedWith("Poll does not exist");
      expect(await voting.isPollOpen(0)).to.equal(false);
      const [voted, idx] = await voting.getVoterChoice(5, ethers.ZeroAddress);
      expect(voted).to.equal(false);
      expect(idx).to.equal(0);
    });

    it("pages through polls with getPolls", async function () {
      const { voting } = await loadFixture(deployFixture);
      for (let i = 0; i < 7; i++) await voting.createPoll(`Q${i}`, "", ["A", "B"], DAY);

      const first = await voting.getPolls(0, 3);
      expect(first.map((p) => p.question)).to.deep.equal(["Q0", "Q1", "Q2"]);
      expect(first.map((p) => Number(p.id))).to.deep.equal([0, 1, 2]);

      const last = await voting.getPolls(5, 10);
      expect(last.map((p) => p.question)).to.deep.equal(["Q5", "Q6"]);

      expect((await voting.getPolls(7, 5)).length).to.equal(0);
      expect((await voting.getPolls(0, 0)).length).to.equal(0);
    });

    it("caps a page at MAX_PAGE_SIZE", async function () {
      const { voting } = await loadFixture(deployFixture);
      for (let i = 0; i < 52; i++) await voting.createPoll(`Q${i}`, "", ["A", "B"], DAY);
      const page = await voting.getPolls(0, 1000);
      expect(page.length).to.equal(50);
      expect(page[49].question).to.equal("Q49");
      expect((await voting.getPolls(50, 50)).length).to.equal(2);
    });

    it("reports open status per poll in a page", async function () {
      const { voting, creator } = await loadFixture(deployFixture);
      await voting.createPoll("Short", "", ["A", "B"], MINUTE);
      await voting.createPoll("Long", "", ["A", "B"], DAY);
      await voting.createPoll("Closed", "", ["A", "B"], DAY);
      await voting.connect(creator).closePoll(2);
      await time.increase(2 * MINUTE);

      const page = await voting.getPolls(0, 10);
      expect(page.map((p) => p.isOpen)).to.deep.equal([false, true, false]);
      expect(page.map((p) => p.closedEarly)).to.deep.equal([false, false, true]);
    });
  });
});
