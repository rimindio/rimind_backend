CREATE MIGRATION m1ogbm3vuxuxxszqxv6z4cny2lidtvkt3nmmzd2xz2kfqvz7rnu5wq
    ONTO m16eqfx56bvgogsfzasznxpkkfvopgm2bbhpk5xuer45oze23uw2ka
{
  ALTER TYPE default::Challenge {
      DROP LINK user;
  };
};
