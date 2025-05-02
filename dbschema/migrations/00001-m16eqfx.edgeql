CREATE MIGRATION m16eqfx56bvgogsfzasznxpkkfvopgm2bbhpk5xuer45oze23uw2ka
    ONTO initial
{
  CREATE FUTURE simple_scoping;
  CREATE TYPE default::User {
      CREATE REQUIRED PROPERTY wallet: std::str;
  };
  CREATE TYPE default::Challenge {
      CREATE REQUIRED LINK user: default::User;
      CREATE REQUIRED PROPERTY expires_at: std::datetime;
      CREATE REQUIRED PROPERTY nonce: std::str;
  };
};
